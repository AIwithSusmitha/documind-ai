# DocuMind AI

DocuMind AI is a Flask application for analyzing resumes in PDF and TXT formats. It can summarize a document, extract selected resume fields, show completeness and visual insights, and export results as JSON or a PDF report.

## Features

- Upload PDF or TXT documents (maximum 10 MiB).
- Try two built-in sample resumes without uploading a file.
- Choose a basic, standard, or detailed analysis and a brief, detailed, or bullet-point summary.
- Select resume fields to focus on: name and email, skills, education, work experience, and projects. Leaving every field unchecked analyzes all fields.
- Review extracted data, completeness, uncertainties, recommendations, and an SVG chart.
- Edit extracted data in the browser and download the current analysis as JSON or PDF.
- Use Gemini when configured, with the existing local analysis fallback enabled by default.

## Project files

```text
app.py
requirements.txt
.gitignore
README.md
templates/
  index.html
static/
  script.js
  style.css
samples/
  sample_report.txt
  sample_resume.txt
```

The sample picker currently uses sample resume text embedded in `app.py`; it does not load the separate files under `samples/`.

## Requirements

- Python 3.11 (the version used by the project's working virtual environment).
- pip.
- A modern web browser.
- A Gemini API key for Gemini-powered analysis. The app's local fallback remains enabled by default and can analyze documents without Gemini.

The dependency versions in `requirements.txt` pin the application dependencies to versions installed in the existing project environment. Gunicorn is included for Linux production hosting such as Render; it is not required to run the local Flask development server.

## Run locally on Windows

Open PowerShell in the project folder:

```powershell
cd path\to\documind_ai
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell does not allow environment activation, use the virtual environment's interpreter directly instead:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Create a `.env` file in the project root if you want to configure Gemini locally. Add variable names and values in your local editor; never paste a real key into chat or commit it:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

The application loads this file locally using `python-dotenv`. Start the app with:

```powershell
python app.py
```

Then open <http://127.0.0.1:5000>. Stop the development server with `Ctrl+C`.

## Configuration

| Variable | Purpose | Behavior |
|---|---|---|
| `GEMINI_API_KEY` | Server-side Gemini API authentication | If absent, the built-in local analysis fallback is used by default. |
| `GEMINI_MODEL` | Gemini model name | Defaults to `gemini-2.5-flash`. |
| `ENABLE_LOCAL_FALLBACK` | Controls fallback after Gemini is unavailable or fails | Defaults to enabled. Values `0`, `false`, or `no` disable it. |

The API key is read only by the Flask backend; it is not required by the frontend. Uploaded document text is sent to Gemini for analysis when Gemini is configured and available. Review the source document to verify AI-generated results.

## Application behavior and limits

- Flask exposes the homepage at `/`, built-in sample endpoints at `/api/samples` and `/api/samples/<sample_name>`, a health endpoint at `/api/health`, document analysis at `/api/analyze`, and PDF report export at `/api/export-pdf`.
- Uploads are limited to 10 MiB. PDF and TXT content is processed in memory; analysis text is limited to 30,000 characters.
- PyMuPDF extracts text from PDFs. Scanned or image-only PDFs do not have OCR support and may have no extractable text.
- PDF reports are generated in memory. The app does not store uploaded files or require a persistent disk or database.
- The health endpoint reports whether a Gemini key is configured, whether local fallback is enabled, and the model name. It does not return the key.
- The local fallback is not Gemini: successful analysis responses may be produced locally when the API key is missing or Gemini fails.

## Local verification checklist

Run the app locally and check the following:

1. Load the homepage and confirm CSS and JavaScript load.
2. Load and analyze each built-in sample resume.
3. Upload a text-based PDF and a TXT file.
4. Try each analysis depth and summary style, and verify that selected focus fields constrain the extraction.
5. Review the structured fields, missing values, completeness indicator, insights, and chart.
6. Edit extracted values, save the edits, then download and inspect both JSON and PDF exports.
7. Verify clear errors for an empty TXT, an unsupported extension, a corrupted/encrypted PDF, and a PDF with no extractable text.
8. Check missing-key behavior with the default fallback. To test an explicit Gemini configuration error, set `ENABLE_LOCAL_FALLBACK=false` locally and test with a missing or invalid key; restore your normal local setting afterward.
9. When using a valid Gemini key, confirm the response's `analysis_source` is `gemini` before treating the test as a Gemini API test. With fallback, a successful HTTP response alone does not prove Gemini was used.

Do not use sensitive personal documents for tests unless you are authorized to send their text to the configured AI provider.

## Deploy to Render

Create a **Web Service** connected to the GitHub repository after the project has been safely prepared and published. Use these settings:

| Render setting | Value |
|---|---|
| Runtime | Python 3.11 |
| Root directory | Project root (leave blank if the repository root contains `app.py`) |
| Build command | `pip install -r requirements.txt` |
| Start command | `gunicorn app:app --bind 0.0.0.0:$PORT` |

In the Render service dashboard, add `GEMINI_API_KEY` as a secret environment variable and set `GEMINI_MODEL` if you want a model other than the default. You may also set `ENABLE_LOCAL_FALLBACK`; it defaults to enabled. Do not upload or commit your local `.env` file. Keep the API key exclusively in Render's environment settings.

The application processes uploads and generated PDFs in memory, so it does not need a persistent disk for these features. The 10 MiB application upload limit and analysis time should still be considered when choosing hosting resources. Scanned-PDF OCR, authentication, and persistent document history are not implemented.

After deployment, check the Render build and runtime logs, open the service URL, and test the homepage, static assets, sample analysis, PDF/TXT uploads, JSON export, and PDF export. Do not consider deployment complete until the public URL and these behaviors have been tested.

## Security

- `.gitignore` excludes `.env`, virtual environments, Python caches, and common generated artifacts.
- Never commit API keys or other secrets, or expose them in browser-side code.
- Before any Git add or publish operation, inspect the exact files being staged and confirm that `.env` and local environment files are excluded.
- Analysis output may be incomplete or inaccurate. Review it against the source document before relying on it.
