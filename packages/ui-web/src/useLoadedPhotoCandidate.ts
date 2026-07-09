import type { PhotoCandidate } from "@trustcare/wallet-core";
import { useEffect, useState } from "react";

const PHOTO_CANDIDATE_TIMEOUT_MS = 2500;

export function useLoadedPhotoCandidate(candidates: PhotoCandidate[]) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState("");
  const candidateListKey = candidates.map((candidate) => candidate.url).join("\0");
  const candidate = candidates[candidateIndex];
  const candidateUrl = candidate?.url;

  useEffect(() => {
    setCandidateIndex(0);
    setLoadedUrl("");
  }, [candidateListKey]);

  useEffect(() => {
    setLoadedUrl("");
  }, [candidateUrl]);

  useEffect(() => {
    if (!candidateUrl || loadedUrl === candidateUrl) return undefined;
    const timeoutId = globalThis.setTimeout(() => {
      setCandidateIndex((index) =>
        candidates[index]?.url === candidateUrl ? index + 1 : index,
      );
    }, PHOTO_CANDIDATE_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeoutId);
  }, [candidateListKey, candidateUrl, loadedUrl]);

  return {
    candidate,
    isLoaded: Boolean(candidateUrl && loadedUrl === candidateUrl),
    markFailed: () => setCandidateIndex((index) => index + 1),
    markLoaded: () => {
      if (candidateUrl) setLoadedUrl(candidateUrl);
    },
  };
}
