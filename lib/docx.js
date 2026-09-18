import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

export async function buildSessionDocx({ patientName, sessionDate, transcript, summary }) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: `Session — ${patientName}`, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: sessionDate, heading: HeadingLevel.HEADING_3 }),

          new Paragraph({ text: "Client Summary", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
          ...summary.split("\n").filter(Boolean).map((line) => new Paragraph({ children: [new TextRun(line)] })),

          new Paragraph({ text: "Transcript (locked record)", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
          ...transcript.split("\n").filter(Boolean).map((line) => new Paragraph({ children: [new TextRun(line)] })),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
