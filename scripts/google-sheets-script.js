function syncSheetsToMaster() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
  
    // Grab all sheets after || to copy
    const allNames        = ss.getSheets().map(s => s.getName());
    const delimiterIndex  = allNames.findIndex(n => n.includes('||'));
    if (delimiterIndex === -1 || delimiterIndex === allNames.length - 1) {
      Logger.log('No sheets found after "||" or "||" not found.');
      return;
    }
    const sourceSheetNames = allNames.slice(delimiterIndex + 1);  // everything after "||"
  
    //  Make sure the master sheet exists and is empty
    const MASTER_NAME = 'Master';
    let   master      = ss.getSheetByName(MASTER_NAME) || ss.insertSheet(MASTER_NAME);
    master.clearContents();
  
    //  Build header + data in memory to write once later
    let header;                // header row we’ll copy from the first source sheet
    const masterData = [];     // all body rows, with Source-Sheet appended
    const linkRich = [];       //  keep the RichTextValue for column B
    const linkFormula  = [];   // store formulas for column B
    
    // Copy the data from seach source sheet into our in-memory copy
    sourceSheetNames.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) return;      // sheet was renamed/deleted
  
      const rows = sheet.getLastRow();
      const cols = 9
      if (rows < 2) return;    // no data below the header
  
      // Grab header only once (row 1)
      if (!header) {
        header = sheet.getRange(1, 1, 1, cols).getValues()[0];
        header.push('Source User');          // add the new column title
      }
  
       // Grab body (rows 2…)
       const bodyRange = sheet.getRange(2, 1, rows - 1, cols);
       const values    = bodyRange.getValues();
  
       // save the rich-text objects from column B (index 1)
       const richTexts = bodyRange.getRichTextValues();
       richTexts.forEach(rt => linkRich.push(rt[1]));   // keep only column B
  
      // Annotate each row with the sheet name
      const annotated = values.map(r => [...r, name]);
      masterData.push(...annotated);
    });
  
    if (!header) {
      Logger.log('No data rows found in the source sheets.');
      return;
    }
  
    // ── 4  Write header and data to Master in one go ────────────────────────────
    master.getRange(1, 1, 1, header.length).setValues([header]);
  
    if (masterData.length) {
      master.getRange(2, 1, masterData.length, header.length).setValues(masterData);
      // re-apply the rich-text (links) to column B
      const linkRange = master.getRange(2, 2, masterData.length, 1); // column B
      linkRange.setRichTextValues(linkRich.map(r => [r]));
    }
  }
  
  
  function buildDailySummary() {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Master');
    
    // ───── column indexes (0-based inside getValues) ─────
    const COL_DATE        = 0;            // column A  – adjust if your date is elsewhere
    const COL_TIME_SPENT  = 4;            // column E  – numeric or duration
    const COL_TAG         = 5;            // column F  – “Enjoyable” | “Neutral” | “Regrettable”
    
    // Fetch the raw log (skip header row)
    const lastRow   = sheet.getLastRow();
    if (lastRow < 2) return;              // nothing to summarise
    const data      = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    
    // ───── aggregate by date ─────
    const tz        = ss.getSpreadsheetTimeZone();
    const summary   = {};                 // { 'YYYY-MM-DD': {enjoy:…, neutral:…, regret:…} }
    
    data.forEach(r => {
      const dateVal   = r[COL_DATE];
      const spent     = +r[COL_TIME_SPENT] || 0;
      const tag       = (r[COL_TAG] || '').toString().trim().toLowerCase();
      if (!(dateVal instanceof Date) || spent === 0) return;   // skip blanks / bad data
      
      const key = Utilities.formatDate(dateVal, tz, 'yyyy-MM-dd');
      if (!summary[key]) summary[key] = {enjoy: 0, neutral: 0, regret: 0};
      
      if (tag === 'enjoyable')      summary[key].enjoy  += spent;
      else if (tag === 'neutral')   summary[key].neutral += spent;
      else if (tag === 'regrettable') summary[key].regret += spent;
    });
    
    // ───── build the output array ─────
    const header = [
      'Date (Summary)', 'Enjoyable', 'Enjoyable %',
      'Neutral',        'Neutral %',
      'Regrettable',    'Regrettable %',
      'Total'
    ];
    
    const rows = Object.keys(summary)
      .sort()                                 // chronological order
      .map(k => {
        const s = summary[k];
        const total = s.enjoy + s.neutral + s.regret;
        return [
          new Date(k),               // L
          s.enjoy,                   // M
          total ? s.enjoy / total : 0, // N
          s.neutral,                 // O
          total ? s.neutral / total : 0, // P
          s.regret,                  // Q
          total ? s.regret / total : 0,  // R
          total                      // S
        ];
      });
    
    // ───── clear old table & write the new one ─────
    const destRange = sheet.getRange(1, 12, rows.length + 1, header.length); // L1:...
    destRange.clear({contentsOnly: true});
    destRange.offset(0, 0, 1, header.length).setValues([header]);
    if (rows.length) destRange.offset(1, 0, rows.length, header.length).setValues(rows);
    
    // ───── basic number formats ─────
    // Dates
    sheet.getRange(2, 12, rows.length, 1).setNumberFormat('yyyy-mm-dd');
    // Percentages (Enjoyable %, Neutral %, Regrettable %)
    sheet.getRange(2, 14, rows.length, 1).setNumberFormat('0.00%'); // col N
    sheet.getRange(2, 16, rows.length, 1).setNumberFormat('0.00%'); // col P
    sheet.getRange(2, 18, rows.length, 1).setNumberFormat('0.00%'); // col R
  }