export const DOMAINS = [
  {
    name: "STEM",
    description: "Science, Technology, Engineering, Mathematics",
    colorCode: "#3B82F6",
    icon: "science",
    subjects: [
      "Mathematics",
      "Physics",
      "Chemistry",
      "Biology",
      "Computer Science",
      "Engineering",
      "Data Science",
      "Statistics",
      "Astronomy",
    ],
  },
  {
    name: "Humanities",
    description: "Literature, History, Philosophy, Arts",
    colorCode: "#10B981",
    icon: "book",
    subjects: [
      "History",
      "Literature",
      "Philosophy",
      "Political Science",
      "Sociology",
      "Psychology",
      "Anthropology",
      "Art History",
    ],
  },
  {
    name: "Languages",
    description: "Foreign Languages, Linguistics",
    colorCode: "#F59E0B",
    icon: "translate",
    subjects: [
      "English",
      "Spanish",
      "French",
      "German",
      "Mandarin",
      "Japanese",
      "Korean",
      "Portuguese",
      "Italian",
      "Arabic",
      "Linguistics",
    ],
  },
  {
    name: "Professional",
    description: "Business, Finance, Law, Medicine",
    colorCode: "#8B5CF6",
    icon: "briefcase",
    subjects: [
      "Business",
      "Finance",
      "Accounting",
      "Marketing",
      "Law",
      "Medicine",
      "Healthcare",
      "Project Management",
      "Entrepreneurship",
    ],
  },
  {
    name: "Creative",
    description: "Art, Music, Design, Writing",
    colorCode: "#EC4899",
    icon: "palette",
    subjects: [
      "Visual Arts",
      "Music",
      "Graphic Design",
      "Creative Writing",
      "Photography",
      "Film",
      "Theater",
      "Animation",
    ],
  },
] as const;

export const DOMAIN_NAMES = DOMAINS.map((d) => d.name);
export const ALL_SUBJECTS = DOMAINS.flatMap((d) => d.subjects);

export function getSubjectsByDomain(domainName: string): readonly string[] {
  const domain = DOMAINS.find((d) => d.name === domainName);
  return domain?.subjects || [];
}

export function getDomainBySubject(subjectName: string): string | undefined {
  return DOMAINS.find((d) =>
    (d.subjects as readonly string[]).includes(subjectName)
  )?.name;
}

export const LEVELS = ["beginner", "medium", "advanced", "expert"] as const;
