const youtubeResults = new Map();
const organizedTracks = new Map();

export function rememberYoutubeResults(results) {
  for (const result of results) {
    youtubeResults.set(result.sourceId, result);
  }
}

export function getYoutubeResult(videoId) {
  return youtubeResults.get(videoId) || null;
}

export function rememberOrganizedTrack(videoId, track) {
  organizedTracks.set(videoId, track);
}

export function getOrganizedTrack(videoId) {
  return organizedTracks.get(videoId) || null;
}
