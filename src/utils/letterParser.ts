/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MentionedPerson, ReferencedLetter } from '../types';

export const IRAQI_RANKS = {
  OFFICERS: [
    'فريق أول',
    'فريق',
    'لواء',
    'عميد',
    'عقيد',
    'مقدم',
    'رائد',
    'نقيب',
    'ملازم أول',
    'ملازم'
  ],
  ENLISTED: [
    'مفوض درجة أولى',
    'مفوض درجة ثانية',
    'مفوض درجة ثالثة',
    'مفوض درجة رابعة',
    'مفوض درجة خامسة',
    'مفوض درجة سادسة',
    'مفوض درجة سابعة',
    'مفوض درجة ثامنة',
    'مفوض',
    'رئيس عرفاء',
    'عريف',
    'نائب عريف',
    'شرطي أول',
    'شرطي',
    'منتسب',
    'موظف مدني'
  ]
};

export const ALL_IRAQI_RANKS = [...IRAQI_RANKS.OFFICERS, ...IRAQI_RANKS.ENLISTED];

export function extractOfficialLetterMetadata(text: string) {
  let bodyText = '';
  let attachments = '';
  let copyTo = '';
  let letterNumber = '';
  let letterDate = '';
  let issuingAuthority = '';
  const mentionedPersons: MentionedPerson[] = [];

  if (!text) {
    return { bodyText, attachments, copyTo, mentionedPersons, letterNumber, letterDate, issuingAuthority };
  }

  // Helper lines array
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Extract Letter Number (العدد / الرقم)
  const numberKeywords = ['العدد:', 'العدد', 'الرقم:', 'الرقم', 'رقم:', 'رقم'];
  for (const line of lines) {
    for (const kw of numberKeywords) {
      if (line.includes(kw)) {
        // Extract what is after the keyword
        const parts = line.split(kw);
        if (parts.length > 1) {
          const possibleNum = parts[1].replace(/^[:\-\s\/\\]+/, '').trim();
          if (possibleNum && possibleNum.length > 2) {
            letterNumber = possibleNum;
            break;
          }
        }
      }
    }
    if (letterNumber) break;
  }

  // 2. Extract Letter Date (التاريخ)
  const dateKeywords = ['التاريخ:', 'التاريخ', 'تاريخ:', 'تاريخ'];
  for (const line of lines) {
    for (const kw of dateKeywords) {
      if (line.includes(kw)) {
        const parts = line.split(kw);
        if (parts.length > 1) {
          const possibleDate = parts[1].replace(/^[:\-\s\/\\]+/, '').trim();
          if (possibleDate && possibleDate.length > 4) {
            letterDate = possibleDate;
            break;
          }
        }
      }
    }
    if (letterDate) break;
  }

  // 3. Extract Issuing Authority (جهة الإصدار)
  // Look at the first 4-5 lines. We are looking for lines with keywords like: وزارة, مديرية, قيادة, مكتب, رئاسة, وكالة
  const authorityKeywords = ['وزارة', 'مديرية', 'قيادة', 'مكتب', 'رئاسة', 'وكالة', 'قسم', 'شعبة'];
  const authorityLines: string[] = [];
  // Grab the first 5 lines to scan
  const topLines = lines.slice(0, Math.min(6, lines.length));
  for (const line of topLines) {
    // If it's Republic of Iraq, let's include it or prioritize it
    if (line.includes('جمهورية العراق')) {
      authorityLines.push('جمهورية العراق');
      continue;
    }
    const hasKeyword = authorityKeywords.some(kw => line.includes(kw));
    // Exclude if it's too long or contains keywords representing subject/date/etc
    const isMetadataLine = ['العدد', 'التاريخ', 'الموضوع', 'إلى', 'المحترم'].some(kw => line.includes(kw));
    if (hasKeyword && !isMetadataLine && line.length < 80) {
      authorityLines.push(line);
    }
  }
  if (authorityLines.length > 0) {
    issuingAuthority = authorityLines.join(' / ');
  } else if (topLines.length > 0) {
    // Fallback: use the first line that is not a generic header if possible
    issuingAuthority = topLines[0];
  }

  // 4. Core Decision / Body Text (بعد الموضوع وحتى مع التقدير / المرفقات / نسخة منه)
  const subjectKeywords = ['الموضوع', 'موضوع', 'الموضوع:'];
  let startIdx = 0;
  
  for (const kw of subjectKeywords) {
    const kwIdx = text.indexOf(kw);
    if (kwIdx !== -1) {
      // Look for the end of the line containing the Subject keyword
      const nextNewline = text.indexOf('\n', kwIdx);
      if (nextNewline !== -1) {
        startIdx = nextNewline + 1;
      } else {
        startIdx = kwIdx + kw.length;
      }
      break;
    }
  }

  let bodySlice = text.slice(startIdx);

  // Stop markers
  const stopMarkers = [
    'مع التقدير',
    'بتقدير',
    'وتقديرنا',
    'وافر التقدير',
    'التقدير والاحترام',
    'المرفقات',
    'المرافقات',
    'مرفقات',
    'نسخة منه إلى',
    'نسخه منه الى',
    'نسخة منه',
    'نسخه منه',
    'صورة منه إلى',
    'صورة منه الى',
    'صورة منه',
    'صوره منه'
  ];

  let minStopIdx = bodySlice.length;
  for (const marker of stopMarkers) {
    const markerIdx = bodySlice.indexOf(marker);
    if (markerIdx !== -1 && markerIdx < minStopIdx) {
      minStopIdx = markerIdx;
    }
  }

  bodyText = bodySlice.slice(0, minStopIdx).trim();
  // Clean up any extra trailing/leading colons or whitespace
  bodyText = bodyText.replace(/^[:\-=\s]+/, '').trim();

  // 5. Extract Attachments (المرفقات)
  const attachmentsKeywords = ['المرفقات', 'المرافقات', 'مرفقات', 'مرفق'];
  let attachmentsIdx = -1;
  for (const kw of attachmentsKeywords) {
    attachmentsIdx = text.indexOf(kw);
    if (attachmentsIdx !== -1) {
      const remainingText = text.slice(attachmentsIdx + kw.length).trim();
      // Take the first line or up to "نسخة منه"
      const linesArr = remainingText.split('\n');
      if (linesArr.length > 0) {
        let cleanLine = linesArr[0].replace(/^[:\-\/\\=\s]+/, '').trim();
        // If the line is empty or just punctuation, maybe check the next line too
        if (!cleanLine && linesArr.length > 1) {
          cleanLine = linesArr[1].trim();
        }
        attachments = cleanLine;
      }
      break;
    }
  }

  // 6. Extract Copy To (نسخة منه إلى)
  const copyToKeywords = ['نسخة منه إلى', 'نسخه منه الى', 'نسخة منه', 'نسخه منه', 'صورة منه إلى', 'صورة منه الى', 'صورة منه', 'صوره منه'];
  let copyToIdx = -1;
  for (const kw of copyToKeywords) {
    copyToIdx = text.indexOf(kw);
    if (copyToIdx !== -1) {
      let copySlice = text.slice(copyToIdx).trim();
      // Remove attachments text if it appears inside the copyTo slice
      for (const attKw of attachmentsKeywords) {
        const attIdxInCopy = copySlice.indexOf(attKw);
        if (attIdxInCopy !== -1 && attIdxInCopy > 5) {
          copySlice = copySlice.slice(0, attIdxInCopy).trim();
        }
      }
      copyTo = copySlice;
      break;
    }
  }

  // 7. Parse Mentioned Persons (رقم إحصائي، رتبة، اسم)
  lines.forEach((line) => {
    // Check if line contains any known rank
    let foundRank = '';
    for (const r of ALL_IRAQI_RANKS) {
      // Word boundaries or exact substring matching to avoid partial match (e.g. "مفوض" matching inside other words)
      const rReg = new RegExp(`(?:^|\\s)(${r})(?:$|\\s)`, 'i');
      if (rReg.test(line)) {
        foundRank = r;
        break;
      }
    }

    if (foundRank) {
      // Find numbers in the line that could be a statistical number (usually 5 to 7 digits in Iraq police/army, or a small list index)
      // Look for a 4 to 7 digit statistical number: e.g. 123456 or ١٢٣٤٥٦
      const statNumMatch = line.match(/(\d{4,7}|[٠-٩]{4,7})/);
      let statisticalNumber = '';
      if (statNumMatch) {
        statisticalNumber = statNumMatch[1];
      } else {
        // Try looking for simple list index like 1-, 1., (1) at the start
        const seqMatch = line.match(/^\s*[(-]?(\d+|[٠-٩]+)[-.)]/);
        if (seqMatch) {
          statisticalNumber = seqMatch[1];
        }
      }

      // Extract Name Part
      let namePart = line;
      // Remove rank and statistical number
      namePart = namePart.replace(foundRank, '');
      if (statisticalNumber) {
        namePart = namePart.replace(statisticalNumber, '');
      }

      // Clean up symbols, brackets, dates, etc.
      namePart = namePart
        .replace(/[\d٠-٩()\-.\/\\:*?\"<>|\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Ensure it looks like a valid name (typically more than 3 chars and not a system keyword)
      const invalidNameWords = ['تنسيب', 'الموضوع', 'المرجع', 'كتاب', 'العدد', 'التاريخ', 'رقم', 'نسخة', 'صورة', 'إلى', 'المحترم'];
      const hasInvalidWord = invalidNameWords.some(w => namePart.includes(w));

      if (namePart.length > 3 && !hasInvalidWord) {
        // Don't duplicate
        if (!mentionedPersons.some(p => p.name === namePart)) {
          mentionedPersons.push({
            statisticalNumber: statisticalNumber || '',
            rank: foundRank,
            name: namePart
          });
        }
      }
    }
  });

  return {
    bodyText,
    attachments,
    copyTo,
    mentionedPersons,
    letterNumber,
    letterDate,
    issuingAuthority,
    referencedLetters: parseReferencedLetters(text, letterNumber)
  };
}

export function parseReferencedLetters(text: string, mainNumber?: string): ReferencedLetter[] {
  const referenced: ReferencedLetter[] = [];
  if (!text) return referenced;

  // Pattern 1: "كتاب <جهة> ذي العدد/المرقم/العدد/رقم <رقم> في/بتاريخ <تاريخ>"
  // Pattern 2: "كتابنا ذي العدد/المرقم/العدد/رقم <رقم> في/بتاريخ <تاريخ>"
  const regexPatterns = [
    /(?:كتاب|أمر|برقية|إشارة)\s+([أ-ي\s]{2,40}?)\s+(?:المرقم|ذي العدد|العدد|رقم)\s*([A-Za-z0-9أ-ي\u0621-\u064A٠-٩/\-\\.\(\)]+)\s+(?:في|بتاريخ)\s+([0-9٠-٩/\-\\.]+)/g,
    /(كتابنا|كتابكم)\s+(?:المرقم|ذي العدد|العدد|رقم)\s*([A-Za-z0-9أ-ي\u0621-\u064A٠-٩/\-\\.\(\)]+)\s+(?:في|بتاريخ)\s+([0-9٠-٩/\-\\.]+)/g
  ];

  for (const pattern of regexPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const authority = match[1].trim();
      const number = match[2].trim();
      const date = match[3].trim();

      // Avoid adding the main letter again if it has the same number
      if (mainNumber && (number.includes(mainNumber) || mainNumber.includes(number))) {
        continue;
      }

      if (number.length > 2 && !referenced.some(r => r.letterNumber === number)) {
        referenced.push({
          issuingAuthority: authority === 'كتابنا' ? 'كتابنا' : authority === 'كتابكم' ? 'كتابكم' : authority,
          letterNumber: number,
          letterDate: date
        });
      }
    }
  }

  // Fallback scanner for lines containing key-words
  const lines = text.split('\n');
  for (const line of lines) {
    if (referenced.length >= 8) break;
    const hasNumWord = ['العدد', 'المرقم', 'رقم'].some(kw => line.includes(kw));
    const hasDateWord = line.includes('في') || line.includes('بتاريخ');
    const hasDate = /([0-9٠-٩]{2,4}[\/\\-][0-9٠-٩]{1,2}[\/\\-][0-9٠-٩]{1,4})/.test(line);

    if (hasNumWord && hasDateWord && hasDate) {
      const containsExisting = referenced.some(r => line.includes(r.letterNumber));
      if (!containsExisting) {
        let authority = '';
        const numIndex = line.search(/(العدد|المرقم|رقم)/);
        if (numIndex > 5) {
          const prefix = line.substring(0, numIndex).trim();
          const words = prefix.split(/\s+/);
          const startIndex = words.findIndex(w => ['كتاب', 'أمر', 'مديرية', 'وزارة', 'قيادة', 'مكتب'].some(kw => w.includes(kw)));
          if (startIndex !== -1) {
            authority = words.slice(startIndex).join(' ');
          } else {
            authority = words.slice(Math.max(0, words.length - 3)).join(' ');
          }
        }

        let number = '';
        const numPartMatch = line.match(/(?:العدد|المرقم|رقم)\s*([A-Za-z0-9أ-ي٠-٩\-\/\\.]+)/);
        if (numPartMatch) {
          number = numPartMatch[1].trim();
        }

        let date = '';
        const dateMatch = line.match(/([0-9٠-٩]{2,4}[\/\\-][0-9٠-٩]{1,2}[\/\\-][0-9٠-٩]{1,4})/);
        if (dateMatch) {
          date = dateMatch[1];
        }

        if (number && date && number.length > 2 && (!mainNumber || (!number.includes(mainNumber) && !mainNumber.includes(number)))) {
          if (!referenced.some(r => r.letterNumber === number)) {
            referenced.push({
              issuingAuthority: authority || 'كتاب إداري مشار إليه',
              letterNumber: number,
              letterDate: date
            });
          }
        }
      }
    }
  }

  return referenced;
}
