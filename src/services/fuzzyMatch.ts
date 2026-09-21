import { OutletPerformance, CandidatePair } from '../types';

/**
 * Calculates Haversine distance in meters between two lat/lng coordinates
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Normalizes text: lowercase, remove special characters, trim multiple spaces
 */
export function cleanText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts unique words from text (excluding very short stop words)
 */
export function getWords(text: string): string[] {
  const stopwords = new Set(['toko', 'tk', 'ud', 'cv', 'pt', 'dan', 'jaya', 'abadi', 'di', 'jl', 'jalan']);
  const words = cleanText(text)
    .split(' ')
    .filter((w) => w.length > 1 && !stopwords.has(w));
  return Array.from(new Set(words));
}

/**
 * Levenshtein distance similarity (0 to 1)
 */
export function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const s1 = cleanText(str1);
  const s2 = cleanText(str2);
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Token overlap + Levenshtein combined fuzzy name match (0 to 100)
 */
export function calculateNameSimilarity(name1: string, name2: string): {
  score: number;
  matchedWords: string[];
  diffWords: string[];
} {
  const words1 = getWords(name1);
  const words2 = getWords(name2);

  const matchedWords: string[] = [];
  const diffWords: string[] = [];

  // Check matching words
  for (const w1 of words1) {
    let foundMatch = false;
    for (const w2 of words2) {
      if (w1 === w2 || calculateLevenshteinSimilarity(w1, w2) >= 0.8) {
        matchedWords.push(w1);
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch) {
      diffWords.push(w1);
    }
  }

  for (const w2 of words2) {
    if (!matchedWords.includes(w2) && !diffWords.includes(w2)) {
      diffWords.push(w2);
    }
  }

  const levSim = calculateLevenshteinSimilarity(name1, name2);
  const tokenOverlap =
    words1.length + words2.length > 0
      ? (2 * matchedWords.length) / (words1.length + words2.length)
      : 0;

  const combined = (tokenOverlap * 0.6 + levSim * 0.4) * 100;
  return {
    score: Math.min(100, Math.round(combined)),
    matchedWords,
    diffWords,
  };
}

/**
 * Distance score (0 to 100):
 * <= 100m -> 100
 * <= 300m -> 85
 * <= 500m -> 65
 * <= 1000m -> 40
 * > 1000m -> decreases linearly to 0 at 3000m
 */
export function calculateDistanceScore(distanceMeters: number | null): number {
  if (distanceMeters === null || isNaN(distanceMeters)) return 50; // fallback if no coord
  if (distanceMeters <= 100) return 100;
  if (distanceMeters <= 300) return 85 - ((distanceMeters - 100) / 200) * 15;
  if (distanceMeters <= 500) return 70 - ((distanceMeters - 300) / 200) * 20;
  if (distanceMeters <= 1000) return 50 - ((distanceMeters - 500) / 500) * 20;
  if (distanceMeters <= 3000) return Math.max(0, 30 - ((distanceMeters - 1000) / 2000) * 30);
  return 0;
}

export type CandidateMatch = CandidatePair;

/**
 * Finds top 5 candidate matches from target pool
 * Scoring: 60% fuzzy match + 40% distance proximity
 */
export function findCandidateMatches(
  source: OutletPerformance,
  targetPool: OutletPerformance[],
  excludeCodes: Set<string> = new Set()
): CandidatePair[] {
  // Pre-filter by Kabupaten / Kecamatan if possible, else allow all in target pool
  const candidates: CandidatePair[] = [];

  const sourceKab = cleanText(source.kabupaten);
  const sourceKec = cleanText(source.kecamatan);

  for (const target of targetPool) {
    if (target.kodeCustNfiGroup === source.kodeCustNfiGroup) continue;
    if (excludeCodes.has(target.kodeCustNfiGroup)) continue;

    // Check locality
    const targetKab = cleanText(target.kabupaten);
    const targetKec = cleanText(target.kecamatan);

    const sameKab = !sourceKab || !targetKab || sourceKab === targetKab;
    const sameKec = !sourceKec || !targetKec || sourceKec === targetKec;

    // Name similarity
    const { score: nameScore, matchedWords, diffWords } = calculateNameSimilarity(
      source.namaCustomerBaru,
      target.namaCustomerBaru
    );

    // Haversine distance
    let distanceMeters: number | null = null;
    let distScore = 50;

    if (
      source.latitude &&
      source.longitude &&
      target.latitude &&
      target.longitude
    ) {
      distanceMeters = calculateHaversineDistance(
        source.latitude,
        source.longitude,
        target.latitude,
        target.longitude
      );
      distScore = calculateDistanceScore(distanceMeters);
    } else {
      // Fallback: boost score if same Kecamatan / Kabupaten
      if (sameKec && sameKab) {
        distScore = 80;
      } else if (sameKab) {
        distScore = 60;
      } else {
        distScore = 30;
      }
    }

    // Weight: 60% name, 40% distance
    const totalScore = Math.round(nameScore * 0.6 + distScore * 0.4);

    // Only consider candidates with a reasonable minimum score unless same name
    if (totalScore >= 35 || nameScore >= 50) {
      candidates.push({
        outlet: target,
        score: totalScore,
        nameScore,
        distScore,
        distanceMeters,
        matchedWords,
        diffWords,
      });
    }
  }

  // Sort by score descending and take top 5
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5);
}
