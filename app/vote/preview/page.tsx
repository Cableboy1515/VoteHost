import BallotForm from "@/components/ballot/BallotForm"

const SAMPLE_QUESTIONS = [
  {
    id: "q1",
    text: "Board President",
    description: "Select one candidate for the position of Board President.",
    type: "SINGLE_CHOICE" as const,
    required: true,
    options: [
      {
        id: "q1-a",
        text: "Maria Reyes",
        bio: "Maria has served on the finance committee for four years and led the 2022 budget restructuring that eliminated the operating deficit.",
        photoUrl: null,
        website: "https://example.com",
      },
      {
        id: "q1-b",
        text: "David Chen",
        bio: "David is a licensed property manager with 12 years of experience managing HOA communities across the region.",
        photoUrl: null,
        website: null,
      },
      {
        id: "q1-c",
        text: "Priya Nair",
        bio: null,
        photoUrl: null,
        website: null,
      },
    ],
  },
  {
    id: "q2",
    text: "Committee Appointments",
    description: "Select up to two members for the facilities committee.",
    type: "MULTIPLE_CHOICE" as const,
    required: true,
    maxSelections: 2,
    options: [
      { id: "q2-a", text: "Tom Burgess", bio: null, photoUrl: null, website: null },
      { id: "q2-b", text: "Anita Patel", bio: "Anita is a licensed contractor specializing in residential plumbing and electrical work.", photoUrl: null, website: null },
      { id: "q2-c", text: "James Okafor", bio: null, photoUrl: null, website: null },
      { id: "q2-d", text: "Lena Hoffmann", bio: null, photoUrl: null, website: null },
    ],
  },
  {
    id: "q3",
    text: "Capital Improvement Priorities",
    description: "Rank the following projects in order of priority. You may rank as many or as few as you like.",
    type: "RANKED_CHOICE" as const,
    required: false,
    options: [
      { id: "q3-a", text: "Parking lot resurfacing", bio: null, photoUrl: null, website: null },
      { id: "q3-b", text: "Lobby renovation", bio: null, photoUrl: null, website: null },
      { id: "q3-c", text: "Pool deck replacement", bio: null, photoUrl: null, website: null },
      { id: "q3-d", text: "Security camera upgrade", bio: null, photoUrl: null, website: null },
    ],
  },
  {
    id: "q4",
    text: "Additional comments or concerns",
    description: null,
    type: "COMMENT" as const,
    required: false,
    options: [],
  },
]

export default function BallotPreviewPage() {
  return (
    <div>
      {/* Preview banner */}
      <div
        className="fixed top-0 left-0 right-0 z-50 text-center py-1.5 text-xs font-medium text-white"
        style={{ background: "oklch(0.55 0.14 70)" }}
      >
        Preview mode — not a real election
      </div>
      <div className="pt-8">
        <BallotForm
          token="preview"
          electionId="preview"
          electionTitle="2025 Annual HOA Election"
          electionDescription="This is a preview of the voter ballot. Your selections won't be saved."
          questions={SAMPLE_QUESTIONS}
        />
      </div>
    </div>
  )
}
