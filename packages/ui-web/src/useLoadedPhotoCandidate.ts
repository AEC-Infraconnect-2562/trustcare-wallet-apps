import type { PhotoCandidate } from "@trustcare/wallet-core";
import { useEffect, useState } from "react";

export function useLoadedPhotoCandidate(candidates: PhotoCandidate[]) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState("");
  const candidateListKey = candidates
    .map((candidate) => candidate.url)
    .join("\0");
  const candidate = candidates[candidateIndex];
  const candidateUrl = candidate?.url;
  const imageSrc = candidateUrl ?? "";

  useEffect(() => {
    setCandidateIndex(0);
    setLoadedUrl("");
  }, [candidateListKey]);

  useEffect(() => {
    setLoadedUrl("");
  }, [imageSrc]);

  return {
    candidate,
    imageSrc,
    isLoaded: Boolean(imageSrc && loadedUrl === imageSrc),
    markFailed: () => setCandidateIndex((index) => index + 1),
    markLoaded: () => {
      if (imageSrc) setLoadedUrl(imageSrc);
    },
  };
}
