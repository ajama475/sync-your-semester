export async function loadPdfDocument(fileLike) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }

  const arrayBuffer = await fileLike.arrayBuffer();

  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
    disableWorker: true,
  });

  return loadingTask.promise;
}
