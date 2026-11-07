import * as pdfjs from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjs.GlobalWorkerOptions.workerSrc = worker

export async function extractText(file, onPage) {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((x) => x.str).join(' ') + '\n'
    onPage?.(i, pdf.numPages)
  }
  return { text: text.replace(/\s+/g, ' ').trim(), pages: pdf.numPages }
}

export async function generateCourse(file, { provider = 'auto', model = 'qwen3.8:latest' }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('provider', provider);
  formData.append('model', model);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to generate course');
    }

    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}
