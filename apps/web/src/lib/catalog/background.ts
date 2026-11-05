import type { Option } from "./search";

const list = (names: string): readonly Option[] =>
  [...new Set(names.split("|").map((name) => name.trim()).filter(Boolean))].map((name) => ({ value: name, label: name }));

/** Common certifications in their usual spelling. Anything else can still be typed. */
export const CERTIFICATION_OPTIONS = list(
  `AWS Cloud Practitioner|AWS Solutions Architect Associate|AWS Solutions Architect Professional|AWS Developer Associate|AWS SysOps Administrator|AWS DevOps Engineer Professional|Azure Fundamentals (AZ-900)|Azure Administrator (AZ-104)|Azure Developer (AZ-204)|Azure Solutions Architect (AZ-305)|Google Cloud Associate Cloud Engineer|Google Cloud Professional Cloud Architect|Certified Kubernetes Administrator (CKA)|Certified Kubernetes Application Developer (CKAD)|HashiCorp Certified: Terraform Associate|Docker Certified Associate|Scrum Master (PSM I)|Professional Scrum Master (PSM II)|Certified ScrumMaster (CSM)|Product Owner (PSPO I)|PMP|PRINCE2|ITIL 4 Foundation|CompTIA A+|CompTIA Network+|CompTIA Security+|CISSP|CEH|OSCP|CCNA|CCNP|Oracle Certified Professional Java SE|Microsoft Certified: Azure Data Fundamentals|Databricks Certified Data Engineer|TensorFlow Developer Certificate|ISTQB Foundation Level|Cambridge English B2 First|Cambridge English C1 Advanced|TOEFL iBT|IELTS`,
);

/** Common job titles. */
export const ROLE_OPTIONS = list(
  `Software Engineer|Senior Software Engineer|Staff Engineer|Principal Engineer|Frontend Developer|Backend Developer|Full Stack Developer|Mobile Developer|iOS Developer|Android Developer|DevOps Engineer|Site Reliability Engineer|Cloud Engineer|Platform Engineer|Data Engineer|Data Scientist|Data Analyst|Machine Learning Engineer|AI Engineer|QA Engineer|QA Automation Engineer|Security Engineer|Solutions Architect|Software Architect|Tech Lead|Engineering Manager|Product Manager|Product Owner|Scrum Master|Project Manager|UX Designer|UI Designer|Product Designer|Business Analyst|Technical Support Engineer|Systems Administrator|Database Administrator|Embedded Software Engineer|Game Developer|Intern|Junior Developer|Web Developer|WordPress Developer|Technical Writer|Developer Advocate`,
);

/** Degrees and levels. */
export const DEGREE_OPTIONS = list(
  `Bachelor's degree|Engineer's degree|Licentiate|Master's degree|MBA|PhD|Associate degree|Technical degree|Technician|Bootcamp|Postgraduate diploma|Diploma|Certificate|High school`,
);

/** Fields of study. */
export const FIELD_OF_STUDY_OPTIONS = list(
  `Computer Science|Software Engineering|Systems Engineering|Information Technology|Information Systems|Computer Engineering|Electronic Engineering|Electrical Engineering|Telecommunications Engineering|Industrial Engineering|Mechatronics|Mathematics|Statistics|Physics|Data Science|Artificial Intelligence|Cybersecurity|Business Administration|Economics|Accounting|Graphic Design|Marketing`,
);
