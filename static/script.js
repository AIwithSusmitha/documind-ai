"use strict";

/* ============================================================
   DocuMind AI — Frontend application logic
   Works with templates/index.html and the Flask app.py routes.
   ============================================================ */

const form = document.getElementById("analysisForm");
const fileInput = document.getElementById("document");
const fileNameLabel = document.getElementById("fileName");
const dropZone = document.getElementById("dropZone");
const sampleSelect = document.getElementById("sampleName");
const analyzeButton = document.getElementById("analyzeButton");
const statusMessage = document.getElementById("statusMessage");

const resultsPanel = document.getElementById("results");
const emptyState = document.getElementById("emptyState");
const resultsContent = document.getElementById("resultsContent");

const resultFilename = document.getElementById("resultFilename");
const resultMeta = document.getElementById("resultMeta");
const documentAvatar = document.querySelector(".document-avatar");
const summaryContent = document.getElementById("summaryContent");
const keyFindings = document.getElementById("keyFindings");
const importantDetails = document.getElementById("importantDetails");
const extractedDataContainer = document.getElementById("extractedData");
const completenessContent = document.getElementById("completenessContent");
const uncertaintiesContent = document.getElementById("uncertaintiesContent");
const recommendationsContent = document.getElementById("recommendationsContent");

const saveEditsButton = document.getElementById("saveEdits");
const downloadJsonButton = document.getElementById("downloadJson");
const downloadPdfButton = document.getElementById("downloadPdf");
const newAnalysisButton = document.getElementById("newAnalysis");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".txt"];

let currentAnalysis = null;
let originalExtractedData = null;
let sampleDocuments = [];
let droppedFile = null;


/* ============================================================
   General helpers
   ============================================================ */

function showStatus(message, isError = false) {
    if (!statusMessage) return;

    statusMessage.textContent = message || "";
    statusMessage.classList.toggle("error", Boolean(isError));
    statusMessage.classList.toggle("success", Boolean(message) && !isError);
}

function setButtonLoading(isLoading) {
    if (!analyzeButton) return;

    analyzeButton.disabled = isLoading;

    const label = analyzeButton.querySelector("span:last-child");
    if (label) {
        label.textContent = isLoading ? "Analyzing document..." : "Analyze document";
    }
}

function getFileExtension(filename) {
    const lastDot = filename.lastIndexOf(".");
    return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
}

function validateFile(file) {
    if (!file) {
        return "Please choose a PDF or TXT file.";
    }

    if (!ALLOWED_EXTENSIONS.includes(getFileExtension(file.name))) {
        return "Unsupported file type. Please upload a PDF or TXT file.";
    }

    if (file.size === 0) {
        return "The selected file is empty.";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "File is too large. The maximum file size is 10 MB.";
    }

    return "";
}

function updateSelectedFile(file) {
    if (fileNameLabel) {
        fileNameLabel.textContent = file ? file.name : "No file selected";
        fileNameLabel.title = file ? file.name : "";
    }

    if (file && sampleSelect) {
        sampleSelect.value = "";
    }
}

function formatLabel(value) {
    return String(value)
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, character => character.toUpperCase());
}

function clearElement(element) {
    if (element) {
        element.replaceChildren();
    }
}

function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    if (text !== undefined && text !== null) {
        element.textContent = String(text);
    }

    return element;
}

function formatDisplayValue(value) {
    if (Array.isArray(value)) {
        return value.map(formatDisplayValue).filter(Boolean).join(", ");
    }
    if (value && typeof value === "object") {
        return Object.entries(value)
            .map(([key, item]) => `${formatLabel(key)}: ${formatDisplayValue(item)}`)
            .join("; ");
    }
    return value === null || value === undefined || value === ""
        ? "Not provided"
        : String(value);
}

/*
 * Render model-provided values with textContent rather than innerHTML.
 * This avoids treating document content as executable HTML.
 */
function renderValue(container, value) {
    if (!container) return;

    clearElement(container);

    if (value === null || value === undefined || value === "") {
        container.appendChild(
            makeElement("p", "muted-text", "No information provided.")
        );
        return;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            container.appendChild(
                makeElement("p", "muted-text", "No items available.")
            );
            return;
        }

        const list = makeElement("ul", "result-list");

        value.forEach(item => {
            const listItem = makeElement("li");

            if (item && typeof item === "object") {
                listItem.textContent = JSON.stringify(item, null, 2);
            } else {
                listItem.textContent = String(item);
            }

            list.appendChild(listItem);
        });

        container.appendChild(list);
        return;
    }

    if (typeof value === "object") {
        const entries = Object.entries(value);

        if (entries.length === 0) {
            container.appendChild(
                makeElement("p", "muted-text", "No details available.")
            );
            return;
        }

        const table = makeElement("table", "data-table");
        const tbody = document.createElement("tbody");

        entries.forEach(([key, item]) => {
            const row = document.createElement("tr");
            const heading = makeElement("th", "", formatLabel(key));
            heading.scope = "row";

            const cell = document.createElement("td");
            cell.textContent = formatDisplayValue(item);

            row.append(heading, cell);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);
        return;
    }

    const paragraph = makeElement("p", "result-paragraph", String(value));
    container.appendChild(paragraph);
}


/* ============================================================
   Sample document loading
   ============================================================ */

async function loadSamples() {
    if (!sampleSelect) return;

    try {
        const response = await fetch("/api/samples");

        if (!response.ok) {
            throw new Error("Could not load sample documents.");
        }

        const samples = await response.json();
        sampleDocuments = Array.isArray(samples) ? samples : [];

        // Preserve the placeholder and rebuild the options.
        sampleSelect.replaceChildren(
            new Option("Choose a sample...", "")
        );

        sampleDocuments.forEach(sample => {
            if (!sample || !sample.name) return;

            const option = new Option(
                sample.title || sample.name,
                sample.name
            );

            sampleSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Sample loading error:", error);
        showStatus("Sample documents could not be loaded. You can still upload a file.", true);
    }
}

async function fetchSampleText(sampleName) {
    const response = await fetch(
        `/api/samples/${encodeURIComponent(sampleName)}`
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Could not load the selected sample.");
    }

    if (typeof data.text !== "string" || !data.text.trim()) {
        throw new Error("The selected sample contains no readable text.");
    }

    return data.text;
}


/* ============================================================
   Upload area: browse, drag and drop, keyboard
   ============================================================ */

if (dropZone && fileInput) {
    dropZone.addEventListener("click", event => {
        if (event.target === fileInput) return;
        fileInput.click();
    });

    dropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", () => {
        droppedFile = null;
        const file = fileInput.files && fileInput.files[0];

        if (!file) {
            updateSelectedFile(null);
            return;
        }

        const error = validateFile(file);

        if (error) {
            fileInput.value = "";
            updateSelectedFile(null);
            showStatus(error, true);
            return;
        }

        updateSelectedFile(file);
        showStatus("");
    });

    ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.add("drag-over");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.remove("drag-over");
        });
    });

    dropZone.addEventListener("drop", event => {
        const file = event.dataTransfer &&
            event.dataTransfer.files &&
            event.dataTransfer.files[0];

        if (!file) return;

        const error = validateFile(file);

        if (error) {
            showStatus(error, true);
            return;
        }

        droppedFile = file;
        // Assign dropped file to the file input where supported.
        try {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            fileInput.files = transfer.files;
        } catch (error) {
            console.warn("Could not populate file input; using dropped file directly.", error);
        }

        updateSelectedFile(file);
        showStatus("");
    });
}

if (sampleSelect) {
    sampleSelect.addEventListener("change", () => {
        if (sampleSelect.value) {
            if (fileInput) fileInput.value = "";
            droppedFile = null;

            updateSelectedFile(null);
            showStatus("Sample selected. Click Analyze document to continue.");
        }
    });
}


/* ============================================================
   Analysis form submission
   ============================================================ */

async function submitAnalysis(event) {
    event.preventDefault();
    showStatus("");

    const selectedFile = (
        droppedFile ||
        fileInput &&
        fileInput.files &&
        fileInput.files[0]
    ) || null;

    const selectedSample = sampleSelect ? sampleSelect.value : "";

    if (!selectedFile && !selectedSample) {
        showStatus("Upload a PDF/TXT file or choose a sample document first.", true);
        return;
    }

    const fileError = selectedFile ? validateFile(selectedFile) : "";

    if (fileError) {
        showStatus(fileError, true);
        return;
    }

    const formData = new FormData();

    if (selectedFile) {
        formData.append("document", selectedFile, selectedFile.name);
    } else {
        try {
            showStatus("Loading sample document...");
            const sampleText = await fetchSampleText(selectedSample);
            const sampleBlob = new Blob([sampleText], {
                type: "text/plain;charset=utf-8"
            });

            formData.append("document", sampleBlob, selectedSample);
        } catch (error) {
            console.error(error);
            showStatus(error.message || "Could not load the sample document.", true);
            return;
        }
    }

    const analysisLevel = document.getElementById("analysisLevel");
    const summaryStyle = document.getElementById("summaryStyle");

    formData.append(
        "analysisLevel",
        analysisLevel ? analysisLevel.value : "standard"
    );
    formData.append(
        "summaryStyle",
        summaryStyle ? summaryStyle.value : "bullets"
    );
    document.querySelectorAll('input[name="focusFields"]:checked').forEach(input => {
        formData.append("focusFields", input.value);
    });

    setButtonLoading(true);
    showStatus("Analyzing your document. This may take a little while.");

    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Analysis failed (HTTP ${response.status}).`);
        }

        currentAnalysis = data;
        originalExtractedData = structuredCloneSafe(data.extracted_data);

        renderAnalysis(data);
        showStatus("Analysis completed successfully.");

        if (resultsPanel) {
            resultsPanel.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    } catch (error) {
        console.error("Document analysis error:", error);
        showStatus(error.message || "An unexpected error occurred during analysis.", true);
    } finally {
        setButtonLoading(false);
    }
}

if (form) {
    form.addEventListener("submit", submitAnalysis);
}

function structuredCloneSafe(value) {
    if (value === undefined) return {};
    return JSON.parse(JSON.stringify(value));
}


/* ============================================================
   Render the analysis response
   ============================================================ */

function renderAnalysis(data) {
    if (!data || typeof data !== "object") {
        showStatus("The server returned an invalid analysis response.", true);
        return;
    }

    if (emptyState) emptyState.hidden = true;
    if (resultsContent) resultsContent.hidden = false;

    if (resultFilename) {
        resultFilename.textContent = data.filename || "Analyzed document";
    }
    if (documentAvatar) {
        documentAvatar.textContent = String(
            data.document_metadata?.file_type || "FILE"
        ).toUpperCase();
    }

    if (resultMeta) {
        const type = formatLabel(data.analysis_type || "resume");
        const count = data.document_metadata
            ? data.document_metadata.characters_analyzed
            : 0;
        const source = data.analysis_source === "local_fallback"
            ? "Local analysis"
            : "Gemini AI";
        const focus = Array.isArray(data.focus_fields) && data.focus_fields.length
            ? ` · Focus: ${data.focus_fields.map(formatLabel).join(", ")}`
            : "";

        resultMeta.textContent = count
            ? `${type} · ${Number(count).toLocaleString()} characters · ${source}${focus}`
            : `${type} · ${source}${focus}`;
    }

    renderValue(summaryContent, data.summary);
    renderValue(keyFindings, data.key_findings);
    renderValue(importantDetails, data.important_details);

    renderExtractedData(data.extracted_data || {});
    renderCompleteness(data.completeness);
    renderValue(uncertaintiesContent, data.uncertainties);
    renderValue(recommendationsContent, data.recommendations);

    renderChart(data);
}

function renderExtractedData(extractedData) {
    if (!extractedDataContainer) return;

    clearElement(extractedDataContainer);
    extractedDataContainer.classList.add("extracted-fields");

    if (
        extractedData === null ||
        extractedData === undefined ||
        (typeof extractedData === "object" &&
            !Array.isArray(extractedData) &&
            Object.keys(extractedData).length === 0)
    ) {
        extractedDataContainer.appendChild(
            makeElement("p", "muted-text", "No extracted data available.")
        );
        return;
    }

    if (Array.isArray(extractedData)) {
        extractedData.forEach((item, index) => {
            const row = makeElement("div", "editable-data-row");
            const label = makeElement("label", "editable-data-label", `Item ${index + 1}`);
            const input = document.createElement("textarea");
            input.className = "editable-data-input";
            input.rows = 2;
            input.value = typeof item === "string"
                ? item
                : JSON.stringify(item, null, 2);
            input.dataset.arrayIndex = String(index);
            label.appendChild(input);
            row.appendChild(label);
            extractedDataContainer.appendChild(row);
        });
        return;
    }

    if (typeof extractedData !== "object") {
        const input = document.createElement("textarea");
        input.className = "editable-data-input";
        input.rows = 3;
        input.value = String(extractedData);
        input.dataset.rootValue = "true";

        const label = makeElement("label", "editable-data-label", "Extracted data");
        label.appendChild(input);
        extractedDataContainer.appendChild(label);
        return;
    }

    Object.entries(extractedData).forEach(([key, value]) => {
        const label = makeElement("label", "editable-data-label", formatLabel(key));
        const isListField = ["skills", "education", "work_experience", "projects"].includes(key);
        const input = isListField
            ? document.createElement("textarea")
            : document.createElement("input");
        input.className = "editable-data-input";
        if (isListField) {
            input.rows = Math.max(2, Math.min(5, Array.isArray(value) ? value.length : 2));
            input.placeholder = "Enter one item per line";
            input.value = Array.isArray(value)
                ? value.map(item => typeof item === "string" ? item : JSON.stringify(item)).join("\n")
                : typeof value === "string" ? value : "";
        } else {
            input.type = "text";
            input.value = typeof value === "string" ? value : "";
        }
        if (value === null || value === undefined) {
            input.placeholder = "Not found in the document (null)";
        }

        input.dataset.key = key;
        label.appendChild(input);
        extractedDataContainer.appendChild(label);
    });
}

function collectEditedExtractedData() {
    if (!currentAnalysis) return {};

    const original = currentAnalysis.extracted_data;

    if (Array.isArray(original)) {
        return Array.from(
            extractedDataContainer.querySelectorAll("textarea[data-array-index]")
        ).map(input => {
            const index = Number(input.dataset.arrayIndex);
            const originalValue = original[index];

            if (originalValue && typeof originalValue === "object") {
                try {
                    return JSON.parse(input.value);
                } catch {
                    return input.value;
                }
            }

            return input.value;
        });
    }

    if (original === null || typeof original !== "object") {
        const rootInput = extractedDataContainer.querySelector(
            'textarea[data-root-value="true"]'
        );
        return rootInput ? rootInput.value : original;
    }

    const updated = {};

    extractedDataContainer.querySelectorAll("input[data-key], textarea[data-key]").forEach(input => {
        const key = input.dataset.key;
        const oldValue = original[key];
        const editedValue = input.value.trim();

        if (!editedValue) {
            updated[key] = null;
            return;
        }

        if (["skills", "education", "work_experience", "projects"].includes(key)) {
            updated[key] = editedValue
                .split(/\r?\n|,/)
                .map(item => item.trim().replace(/^[-•*]\s*/, ""))
                .filter(Boolean);
            if (updated[key].length === 0) updated[key] = null;
            return;
        }

        if (oldValue && typeof oldValue === "object") {
            try {
                updated[key] = JSON.parse(editedValue);
            } catch {
                updated[key] = editedValue;
            }
        } else {
            updated[key] = editedValue;
        }
    });

    return updated;
}

if (saveEditsButton) {
    saveEditsButton.addEventListener("click", () => {
        if (!currentAnalysis) {
            showStatus("Analyze a document before saving edits.", true);
            return;
        }

        currentAnalysis.extracted_data = collectEditedExtractedData();
        originalExtractedData = structuredCloneSafe(currentAnalysis.extracted_data);
        currentAnalysis.completeness = getResumeCompleteness(currentAnalysis.extracted_data);
        renderCompleteness(currentAnalysis.completeness);
        renderChart(currentAnalysis);

        showStatus("Extracted data edits saved for this session.");
    });
}


/* ============================================================
   Completeness check
   ============================================================ */

function getResumeCompleteness(extractedData) {
    const focusToFields = {
        name: ["name", "email"],
        skills: ["skills"],
        education: ["education"],
        experience: ["work_experience"],
        projects: ["projects"]
    };
    const selectedFocus = currentAnalysis && Array.isArray(currentAnalysis.focus_fields)
        ? currentAnalysis.focus_fields
        : Object.keys(focusToFields);
    const requiredFields = selectedFocus.flatMap(field => focusToFields[field] || []);
    const fieldsToCheck = requiredFields.length
        ? [...new Set(requiredFields)]
        : ["name", "email", "skills", "education", "work_experience", "projects"];
    const missingFields = fieldsToCheck.filter(field => {
        const value = extractedData[field];
        if (field === "email") {
            return !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(value || "").trim());
        }
        return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    });
    const score = Math.round(
        ((fieldsToCheck.length - missingFields.length) / fieldsToCheck.length) * 100
    );

    return {
        score,
        status: missingFields.length ? "Needs review" : "Complete",
        missing_fields: missingFields,
        notes: [
            "Completeness checks only whether selected fields were found; it does not assess accuracy or quality."
        ]
    };
}

function renderCompleteness(completeness) {
    if (!completenessContent) return;

    clearElement(completenessContent);

    if (!completeness) {
        completenessContent.appendChild(
            makeElement("p", "muted-text", "No completeness check was returned.")
        );
        return;
    }

    if (typeof completeness === "string") {
        renderValue(completenessContent, completeness);
        return;
    }

    if (Array.isArray(completeness)) {
        renderValue(completenessContent, completeness);
        return;
    }

    const status = completeness.status || completeness.result;

    if (Number.isFinite(Number(completeness.score))) {
        const score = Math.max(0, Math.min(100, Number(completeness.score)));
        const scoreLabel = makeElement("p", "completeness-score", `${score}% complete`);
        const progress = document.createElement("progress");
        progress.className = "completeness-progress";
        progress.max = 100;
        progress.value = score;
        progress.setAttribute("aria-label", `Resume completeness ${score}%`);
        completenessContent.append(scoreLabel, progress);
    }

    if (status) {
        const statusElement = makeElement("p", "completeness-status", status);
        completenessContent.appendChild(statusElement);
    }

    const missingItems = completeness.missing_fields || completeness.missing_items || completeness.missing;
    const notes = completeness.notes || completeness.details;

    if (missingItems && (
        !Array.isArray(missingItems) || missingItems.length > 0
    )) {
        completenessContent.appendChild(
            makeElement("h4", "subsection-heading", "Missing or review fields")
        );
        renderValue(
            completenessContent,
            Array.isArray(missingItems) && missingItems.every(item => typeof item === "string")
                ? missingItems.map(formatLabel)
                : missingItems
        );
    }

    if (notes && (
        !Array.isArray(notes) || notes.length > 0
    )) {
        completenessContent.appendChild(
            makeElement("h4", "subsection-heading", "Notes")
        );
        renderValue(completenessContent, notes);
    }

    const remainingEntries = Object.entries(completeness).filter(
        ([key]) => ![
            "score", "status", "result", "missing_fields", "missing_items", "missing", "notes", "details"
        ].includes(key)
    );

    if (remainingEntries.length > 0) {
        const remaining = Object.fromEntries(remainingEntries);
        const wrapper = makeElement("div", "completeness-extra");
        renderValue(wrapper, remaining);
        completenessContent.appendChild(wrapper);
    }

    if (completenessContent.childElementCount === 0) {
        completenessContent.appendChild(
            makeElement("p", "muted-text", "No missing items were reported.")
        );
    }
}


/* ============================================================
   Chart rendering
   ============================================================ */

function renderChart(data) {
    const container = document.getElementById("insightsChart");
    if (!container) return;
    clearElement(container);
    const extracted = data.extracted_data || {};
    const rows = [
        ["Skills", extracted.skills],
        ["Education", extracted.education],
        ["Work experience", extracted.work_experience],
        ["Projects", extracted.projects]
    ];
    const labels = rows.map(([label]) => label);
    const values = [
        ...rows.map(([, value]) => Array.isArray(value) ? value.length : 0)
    ];
    const maxValue = Math.max(1, ...values);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 640 224");
    svg.setAttribute("role", "presentation");
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");

    labels.forEach((label, index) => {
        const y = 27 + index * 49;
        const barWidth = values[index] === 0 ? 0 : Math.max(8, (values[index] / maxValue) * 350);
        const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        labelText.setAttribute("x", "0");
        labelText.setAttribute("y", String(y + 14));
        labelText.setAttribute("class", "chart-label");
        labelText.textContent = label;

        const track = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        track.setAttribute("x", "170");
        track.setAttribute("y", String(y));
        track.setAttribute("width", "380");
        track.setAttribute("height", "20");
        track.setAttribute("rx", "8");
        track.setAttribute("class", "chart-track");

        const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bar.setAttribute("x", "170");
        bar.setAttribute("y", String(y));
        bar.setAttribute("width", String(barWidth));
        bar.setAttribute("height", "20");
        bar.setAttribute("rx", "8");
        bar.setAttribute("class", "chart-bar");

        const valueText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        valueText.setAttribute("x", String(565 + (values[index] > 9 ? -8 : 0)));
        valueText.setAttribute("y", String(y + 15));
        valueText.setAttribute("class", "chart-value");
        valueText.textContent = String(values[index]);
        svg.append(labelText, track, bar, valueText);
    });

    container.appendChild(svg);
}


/* ============================================================
   Export JSON
   ============================================================ */

function downloadAnalysisJSON() {
    if (!currentAnalysis) {
        showStatus("Please analyze a document first.", true);
        return;
    }

    // Export the latest values, including edits saved during this session.
    const exportData = {
        ...currentAnalysis,
        exported_at: new Date().toISOString()
    };

    const blob = new Blob(
        [JSON.stringify(exportData, null, 2)],
        { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const safeFilename = (currentAnalysis.filename || "document")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9_-]/gi, "_");

    link.href = url;
    link.download = `documind_${safeFilename}_analysis.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus("Analysis JSON exported successfully.");
}

if (downloadJsonButton) {
    downloadJsonButton.addEventListener("click", downloadAnalysisJSON);
}


/* ============================================================
   Export PDF through Flask
   ============================================================ */

async function downloadAnalysisPDF() {
    if (!currentAnalysis) {
        showStatus("Please analyze a document first.", true);
        return;
    }

    if (!downloadPdfButton) return;

    const originalText = downloadPdfButton.textContent;

    try {
        downloadPdfButton.disabled = true;
        downloadPdfButton.textContent = "Generating PDF...";

        const exportData = {
            ...currentAnalysis,
            exported_at: new Date().toISOString()
        };

        const response = await fetch("/api/export-pdf", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(exportData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                errorData.error || `PDF export failed (HTTP ${response.status}).`
            );
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = makePdfFilename(currentAnalysis.filename);

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        showStatus("PDF report downloaded successfully.");
    } catch (error) {
        console.error("PDF export error:", error);
        showStatus(error.message || "Could not download the PDF report.", true);
    } finally {
        downloadPdfButton.disabled = false;
        downloadPdfButton.textContent = originalText || "Download PDF report";
    }
}

function makePdfFilename(filename) {
    const stem = String(filename || "document")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9_-]/gi, "_");

    return `documind_${stem || "document"}_analysis.pdf`;
}

if (downloadPdfButton) {
    downloadPdfButton.addEventListener("click", downloadAnalysisPDF);
}


/* ============================================================
   Start a new analysis
   ============================================================ */

function resetAnalysisView() {
    currentAnalysis = null;
    originalExtractedData = null;

    if (form) form.reset();

    if (fileInput) fileInput.value = "";
    if (sampleSelect) sampleSelect.value = "";

    droppedFile = null;

    updateSelectedFile(null);

    if (resultsContent) resultsContent.hidden = true;
    if (emptyState) emptyState.hidden = false;

    showStatus("");

    if (form) {
        form.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

if (newAnalysisButton) {
    newAnalysisButton.addEventListener("click", resetAnalysisView);
}


/* ============================================================
   Initial page setup
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    loadSamples();

    if (fileNameLabel && (!fileNameLabel.textContent || !fileNameLabel.textContent.trim())) {
        fileNameLabel.textContent = "No file selected";
    }
});
