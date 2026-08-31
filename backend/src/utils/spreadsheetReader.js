import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { ApiError } from "./errors.js";

const MAX_ROWS = 2000;

// Generic file-to-rows reader for the migration import — unlike
// importValidate.js's PROPERTY_CSV_HEADERS/TENANT_CSV_HEADERS tools, this
// reads whatever headers a spreadsheet actually has, no fixed template
// required. Supports .csv and .xlsx, since real exports from Yardi/
// AppFolio/Buildium/etc. come in either form. .xls (the old pre-2007
// binary format) isn't supported — exceljs only reads the OOXML .xlsx
// format — so that gets a clear message pointing at the two that work.
//
// Returns { headers, rows } where rows is an array of { header: rawValue }
// objects (all values coerced to trimmed strings, same shape
// parseCsvBuffer in routes/imports.js already produces) — everything
// downstream (the AI mapping call, the existing row validators) works off
// this one shape regardless of source format.
export async function readSpreadsheet(buffer, filename) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".xlsx")) return readExcelBuffer(buffer);
  if (lower.endsWith(".xls")) {
    throw new ApiError(400, "The old .xls format isn't supported — please re-save as .xlsx or .csv and try again");
  }
  if (lower.endsWith(".csv")) return readCsvBuffer(buffer);
  throw new ApiError(400, "File must be a .csv or .xlsx");
}

function finalizeTable(headerRow, dataRows) {
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);
  if (headers.length === 0) throw new ApiError(400, "Could not find any column headers in this file");
  if (dataRows.length === 0) throw new ApiError(400, "File has no data rows");
  if (dataRows.length > MAX_ROWS) throw new ApiError(400, `File has too many rows (max ${MAX_ROWS} per import)`);

  const rows = dataRows.map((cols) => {
    const obj = {};
    headerRow.forEach((h, i) => {
      const key = String(h ?? "").trim();
      if (!key) return; // an unlabeled column has nothing to map to; its values are unreachable
      obj[key] = cols[i] === undefined || cols[i] === null ? "" : String(cols[i]).trim();
    });
    return obj;
  });

  return { headers, rows };
}

function readCsvBuffer(buffer) {
  const text = buffer.toString("utf8");
  let table;
  try {
    table = parse(text, { bom: true, skip_empty_lines: true, trim: true });
  } catch {
    throw new ApiError(400, "Could not parse this file as CSV");
  }
  if (table.length === 0) throw new ApiError(400, "CSV file is empty");
  return finalizeTable(table[0], table.slice(1));
}

// A cell's .value can be a plain primitive, a Date, a formula result object
// ({ result: ... }), or a rich-text object ({ richText: [...] }) — this
// normalizes every shape exceljs might hand back into a plain display
// string, same as how a CSV cell is always just text.
function cellToString(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return String(v.result ?? "");
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text ?? "");
  }
  return String(v);
}

async function readExcelBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ApiError(400, "Could not parse this file as an Excel workbook");
  }

  // Only the first worksheet — a portfolio export is realistically a single
  // sheet, and picking one deterministically avoids guessing which of
  // several sheets in an unfamiliar export is the "real" data.
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ApiError(400, "This workbook has no worksheets");

  const table = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    // exceljs columns are 1-indexed and row.values[0] is always empty —
    // iterating cells directly (rather than row.values) keeps column
    // position correct even when a row's first cell is blank.
    let maxCol = row.cellCount;
    for (let i = 1; i <= maxCol; i++) {
      cells.push(cellToString(row.getCell(i)));
    }
    table.push(cells);
  });

  if (table.length === 0) throw new ApiError(400, "Worksheet is empty");
  return finalizeTable(table[0], table.slice(1));
}
