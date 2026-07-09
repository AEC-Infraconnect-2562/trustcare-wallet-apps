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

  useEffect(() => {
    if (!imageSrc || loadedUrl === imageSrc) return undefined;

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (!cancelled) setLoadedUrl(imageSrc);
    };
    image.onerror = () => {
      if (cancelled) return;
      setCandidateIndex((index) =>
        candidates[index]?.url === candidateUrl ? index + 1 : index,
      );
    };
    image.src = imageSrc;

    if (image.complete && image.naturalWidth > 0) {
      setLoadedUrl(imageSrc);
    }

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [candidateListKey, candidateUrl, candidates, imageSrc, loadedUrl]);

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
