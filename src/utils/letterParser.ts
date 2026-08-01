/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MentionedPerson } from '../types';

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
  const mentionedPersons: MentionedPerson[] = [];

  if (!text) {
    return { bodyText, attachments, copyTo, mentionedPersons };
  }

  // 1. Core Decision / Body Text (بعد الموضوع وحتى مع التقدير / المرفقات / نسخة منه)
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

  // 2. Extract Attachments (المرفقات)
  const attachmentsKeywords = ['المرفقات', 'المرافقات', 'مرفقات', 'مرفق'];
  let attachmentsIdx = -1;
  for (const kw of attachmentsKeywords) {
    attachmentsIdx = text.indexOf(kw);
    if (attachmentsIdx !== -1) {
      const remainingText = text.slice(attachmentsIdx + kw.length).trim();
      // Take the first line or up to "نسخة منه"
      const lines = remainingText.split('\n');
      if (lines.length > 0) {
        let cleanLine = lines[0].replace(/^[:\-\/\\=\s]+/, '').trim();
        // If the line is empty or just punctuation, maybe check the next line too
        if (!cleanLine && lines.length > 1) {
          cleanLine = lines[1].trim();
        }
        attachments = cleanLine;
      }
      break;
    }
  }

  // 3. Extract Copy To (نسخة منه إلى)
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

  // 4. Parse Mentioned Persons (رقم إحصائي، رتبة، اسم)
  const lines = text.split('\n');
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
    mentionedPersons
  };
}
