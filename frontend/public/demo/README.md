# Demo Syllabi

These files represent real-world syllabus variations for testing Cueforth's PanicButton workflow.

## `syllabus-clean.pdf`
- **Type:** "Golden path" — well-structured, digital-native PDF
- **Characteristics:** Clear headings, bulleted lists, consistent date formats
- **Goal:** Should achieve >90% extraction accuracy
- **Use case:** First-run demo, confidence builder

## `syllabus-dirty.pdf`
- **Type:** Real-world complex syllabus
- **Characteristics:** Tables, multi-column layouts, mixed date formats, embedded images
- **Goal:** Tests parsing resilience and confidence scoring
- **Use case:** Exam-range handling, duplicate suppression, precision/recall trade-offs

## `syllabus-dirty2.pdf`
- **Type:** Text-native but noisy course outline
- **Characteristics:** Weekly schedule structure, recurring assessment patterns, publication dates, and policy noise
- **Goal:** Catch false positives from schedule text and publication metadata
- **Use case:** Benchmarking parser precision on messy but selectable PDFs

## `syllabus-scanned.pdf` (not yet checked in)
- **Type:** "Known failure case" — image-based PDF
- **Characteristics:** Scanned pages, no selectable text
- **Goal:** Demonstrate graceful degradation once an OCR fallback exists
- **Use case:** Setting realistic expectations for unsupported formats

## Usage
- Development: Use for parser testing and validation
- Demonstration: Show how Cueforth's PanicButton workflow handles different real-world documents
- Evaluation: Measure extraction improvements across clean and messy fixtures
