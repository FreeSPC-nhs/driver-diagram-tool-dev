# Driver Diagram Tool

A browser-based tool for building, editing and sharing **driver diagrams** for quality improvement. It helps teams show how a shared aim connects to the factors that influence it, possible change ideas and measures of progress.

The diagram is a way to **develop and communicate a team's theory of change**. It does not replace discussion, local evidence or agreement among the people involved in the improvement work.

## What you can do

- Build a four-level diagram: **Aim → Primary drivers → Secondary drivers → Change ideas**.
- Add **outcome, process and balancing measures** to diagram elements.
- Add and edit connections, including additional links between drivers, with curved, straight or right-angle lines.
- Reorder items, edit text directly, and use **Undo** and **Redo**.
- Name and apply custom colours, with an optional key.
- Adjust box sizes, spacing and text appearance.
- Switch between **Diagram** and **Outline** views.
- Save an editable diagram, download a CSV backup, or export a finished chart as **PDF, PNG or SVG**.
- Use optional **AI guidance** to prepare prompts and import compatible CSV produced elsewhere. The guidance does **not** connect to an AI service automatically.

## Getting started

1. Open the published Driver Diagram Tool in your browser.
2. Create or edit your **aim**: the outcome you want to achieve.
3. Use the **+** controls on diagram boxes to add primary drivers, secondary drivers and change ideas.
4. Select or double-click an item to edit it. Add relevant measures beneath the boxes.
5. Use the editing panel to manage **Colours and key** and **Diagram appearance**. Use the sidebar icon to collapse or reopen the panel.
6. Switch to **Outline** if you prefer working with the diagram as a structured list.
7. **Save your work regularly** using the options described below.

Select **Help** in the tool for detailed instructions, including how to edit connections, use keyboard shortcuts and manage measures.

## Saving, reopening and exporting

| Option | What it does | Best for |
| --- | --- | --- |
| **Save diagram** | Downloads an editable `.html` copy containing the diagram and application code. | Continuing work or sharing an editable diagram. |
| **Open saved file** | Imports a CSV backup previously exported from the tool. | Restoring a diagram from a backup. |
| **Download CSV backup** | Downloads the diagram's structured data as `.csv`. | Keeping a separate backup or transferring diagram data. |
| **Export chart → PDF** | Opens a print-ready view with A3, A2 and A1 landscape options and a readability estimate. | Printing and sharing a finished diagram. |
| **Export chart → PNG** | Downloads a high-resolution image. | Slides, reports and presentations. |
| **Export chart → SVG** | Downloads a scalable vector image. | Sharp diagrams at different sizes and use in compatible design software. |

**Important:** To reopen an editable HTML diagram, open the downloaded `.html` file directly in your browser. **Open saved file** inside the application is for **CSV** backups, not HTML files. If you make further changes to a saved HTML diagram, choose **Save diagram** again to download the updated version; the browser does not automatically overwrite the original.

For PDF export, select **Print / Save as PDF** in the preview, choose your browser's **Save as PDF** destination and check the paper size and background graphics settings. Dense diagrams may require a larger page to remain readable.

## Optional AI guidance

The **AI guidance** section helps you draft a prompt for use with an external AI service and import compatible diagram CSV. It does not itself send your diagram to an AI service.

Only use an AI service approved by your organisation for the information and task concerned. AI-generated drivers and change ideas should be treated as **suggestions for discussion**, not as an agreed or validated improvement plan.

## Information governance and data handling

- The application is a browser-based editor; there is no built-in user account or server-side diagram storage feature.
- Saved HTML diagrams and CSV backups **contain the data and text entered into the diagram**. Store and share these files in accordance with your organisation's information-governance and cybersecurity policies.
- Do not enter patient-identifiable, staff-identifiable or other confidential information unless its use in this tool and its storage have been appropriately authorised. Removing names alone may not remove identifiability.
- Be particularly careful when copying diagram material into a separate AI service.

## Hosting and project files

This is a static HTML, CSS and JavaScript application. It does not require a database or server-side application code.

Keep the following files together in the published site directory:

```text
index.html
styles.css
driver.js
papaparse.min.js
README.md
```

`index.html` should load the locally hosted CSV parser using:

```html
<script src="./papaparse.min.js"></script>
```

The `papaparse.min.js` library is used for CSV import and export. Editable HTML files created with **Save diagram** are intended to contain the required application code and dependencies so they can be reopened independently. **Test this offline before publishing updates**, especially after modifying the save functionality.

For deployment on GitHub Pages or another static host, publish `index.html` and the supporting files in the same directory, then test the hosted application in a current desktop browser.

## Reporting problems

If an issue-reporting facility is enabled for this repository, please report bugs there. Useful details include the browser and version, what you were trying to do, and how to reproduce the problem. **Do not attach diagrams containing confidential or identifiable information.**

## Further reading

- [NHS England — Driver diagrams](https://www.england.nhs.uk/improvement-hub/wp-content/uploads/sites/44/2018/06/An-example-of-driver-diagrams-1.pdf)
- [Institute for Healthcare Improvement — Driver Diagram](https://www.ihi.org/resources/Pages/Tools/Driver-Diagram.aspx)

## Third-party software and licensing

CSV processing uses [PapaParse](https://www.papaparse.com/), distributed under the **MIT licence**. Retain the applicable third-party licence notice with the deployed source files.

A project-wide licence is **not specified in this README**. If you intend to permit others to reuse or modify the application source code, add an appropriate `LICENSE` file to the repository.

---

**Release:** Version 1.0 · Browser-based driver diagram editor
