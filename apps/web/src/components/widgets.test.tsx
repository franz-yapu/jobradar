import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18n } from "../i18n";
import { locationLabel, locationOptions } from "../lib/catalog/countries";
import { searchKey, searchOptions } from "../lib/catalog/search";
import { STACK_CATALOG, STACK_OPTIONS } from "../lib/catalog/stack";
import { ROLE_OPTIONS } from "../lib/catalog/background";
import { Autocomplete } from "./Autocomplete";
import { Combobox } from "./Combobox";
import { MonthYearInput } from "./MonthYearInput";
import { MultiSelect } from "./MultiSelect";
import { Select } from "./Select";

function wrap(node: React.ReactNode, language: "en" | "es" = "en") {
  return render(<I18nextProvider i18n={createI18n(language)}>{node}</I18nextProvider>);
}

describe("catalog search", () => {
  it("matches without caring for case, accents or punctuation", () => {
    expect(searchKey("Node.js")).toBe("nodejs");
    expect(searchOptions(STACK_OPTIONS, "nodejs")[0]?.value).toBe("Node.js");
    expect(searchOptions(STACK_OPTIONS, "c#")[0]?.value).toBe("C#");
    expect(searchOptions(STACK_OPTIONS, "cpp")[0]?.value).toBe("C++");
    expect(searchOptions(STACK_OPTIONS, "dotnet")[0]?.value).toBe(".NET");
  });

  it("ranks an exact match before a prefix and a prefix before a substring", () => {
    const found = searchOptions(STACK_OPTIONS, "java").map((option) => option.value);
    expect(found[0]).toBe("Java");
    expect(found.indexOf("JavaScript")).toBeGreaterThan(0);
  });

  it("the stack catalog has no duplicates and a useful size", () => {
    expect(new Set(STACK_CATALOG).size).toBe(STACK_CATALOG.length);
    expect(STACK_CATALOG.length).toBeGreaterThan(300);
  });
});

describe("country names", () => {
  const keywords = { latam: "Latin America", worldwide: "Worldwide" };

  it("shows names in the active language and keeps the ISO code as the value", () => {
    expect(locationLabel("BO", "en", keywords)).toBe("Bolivia");
    expect(locationLabel("DE", "es", keywords)).toBe("Alemania");
    expect(locationLabel("DE", "en", keywords)).toBe("Germany");
    expect(locationLabel("latam", "en", keywords)).toBe("Latin America");
  });

  it("lists the keywords first, then every country, and finds a country by its Spanish name", () => {
    const options = locationOptions("es", { latam: "Latinoamérica", worldwide: "Todo el mundo" });
    expect(options.slice(0, 2).map((option) => option.value)).toEqual(["latam", "worldwide"]);
    expect(options.length).toBeGreaterThan(240);
    expect(searchOptions(options, "aleman")[0]?.value).toBe("DE");
  });
});

function ComboHarness({ custom = false }: { custom?: boolean }) {
  const [values, setValues] = useState<string[]>([]);
  return (
    <>
      <Combobox
        label="Stack"
        values={values}
        onChange={setValues}
        options={STACK_OPTIONS}
        {...(custom ? { normalizeCustom: (raw: string) => raw } : {})}
      />
      <output data-testid="values">{values.join("|")}</output>
    </>
  );
}

describe("Combobox", () => {
  it("filters suggestions as you type and adds the clicked one as a chip", async () => {
    const user = userEvent.setup();
    wrap(<ComboHarness />);
    await user.type(screen.getByRole("combobox", { name: "Stack" }), "nodejs");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Node.js");
    await user.click(options[0] as HTMLElement);
    expect(screen.getByTestId("values")).toHaveTextContent("Node.js");
    expect(screen.getByRole("button", { name: "Remove Node.js" })).toBeInTheDocument();
  });

  it("works with the keyboard: arrows move, Enter picks, Backspace removes the last chip", async () => {
    const user = userEvent.setup();
    wrap(<ComboHarness />);
    const input = screen.getByRole("combobox", { name: "Stack" });
    await user.type(input, "react");
    const second = screen.getAllByRole("option")[1]?.textContent ?? "";
    await user.keyboard("{ArrowDown}{Enter}");
    // ArrowDown moved from the exact match to the second suggestion
    expect(screen.getByTestId("values").textContent).toBe(second);
    expect(second).not.toBe("React");
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("values")).toHaveTextContent("");
  });

  it("does not offer what is already chosen", async () => {
    const user = userEvent.setup();
    wrap(<ComboHarness />);
    const input = screen.getByRole("combobox", { name: "Stack" });
    await user.type(input, "docker{Enter}");
    await user.type(input, "docker");
    expect(screen.queryByRole("option", { name: "Docker" })).not.toBeInTheDocument();
  });

  it("adds text that is not in the catalog only when custom values are allowed", async () => {
    const user = userEvent.setup();
    const { unmount } = wrap(<ComboHarness />);
    await user.type(screen.getByRole("combobox", { name: "Stack" }), "Zzzfoo{Enter}");
    expect(screen.getByTestId("values")).toHaveTextContent("");
    expect(screen.getByText("No matches")).toBeInTheDocument();
    unmount();

    wrap(<ComboHarness custom />);
    await user.type(screen.getByRole("combobox", { name: "Stack" }), "Zzzfoo");
    expect(screen.getByRole("option", { name: "Add “Zzzfoo”" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("values")).toHaveTextContent("Zzzfoo");
  });

  it("closes the list with Escape and removes a chip with its button", async () => {
    const user = userEvent.setup();
    wrap(<ComboHarness />);
    const input = screen.getByRole("combobox", { name: "Stack" });
    await user.type(input, "git{Enter}");
    await user.type(input, "po");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Git" }));
    expect(screen.getByTestId("values")).toHaveTextContent("");
  });
});

describe("Select", () => {
  it("is a labelled native select that keeps a value the list does not know", async () => {
    const user = userEvent.setup();
    let picked = "";
    wrap(<Select label="Level" value="fluent" options={[{ value: "A1", label: "A1" }]} onChange={(value) => (picked = value)} />);
    const select = screen.getByLabelText("Level");
    expect(select).toHaveValue("fluent");
    await user.selectOptions(select, "A1");
    expect(picked).toBe("A1");
  });
});

describe("MultiSelect", () => {
  function Harness() {
    const [values, setValues] = useState<string[]>([]);
    const options = [
      { value: "freelance", label: "Freelance" },
      { value: "internship", label: "Internship" },
    ];
    return <MultiSelect label="Excluded contracts" values={values} options={options} onChange={setValues} />;
  }

  it("opens a checklist, shows the choices in the button and closes with Escape", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const button = screen.getByRole("button", { name: /Excluded contracts/ });
    expect(button).toHaveTextContent("Choose…");
    await user.click(button);
    await user.click(screen.getByRole("checkbox", { name: "Freelance" }));
    await user.click(screen.getByRole("checkbox", { name: "Internship" }));
    expect(button).toHaveTextContent("Freelance, Internship");
    await user.click(screen.getByRole("checkbox", { name: "Freelance" }));
    expect(button).toHaveTextContent("Internship");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("MonthYearInput", () => {
  function Harness({ language }: { language: "en" | "es" }) {
    const [value, setValue] = useState<{ year: number | undefined; month: number | undefined }>({ year: undefined, month: undefined });
    return (
      <>
        <MonthYearInput label="Start" year={value.year} month={value.month} onChange={setValue} />
        <output data-testid="out">{`${value.year ?? ""}-${value.month ?? ""}`}</output>
        <span hidden>{language}</span>
      </>
    );
  }

  it("needs the year before the month, names months in the active language, and clears both together", async () => {
    const user = userEvent.setup();
    wrap(<Harness language="es" />, "es");
    const group = screen.getByRole("group", { name: "Start" });
    const [month, year] = within(group).getAllByRole("combobox");
    expect(month).toBeDisabled();
    await user.selectOptions(year as HTMLElement, "2021");
    expect(month).toBeEnabled();
    expect(within(month as HTMLElement).getByRole("option", { name: "marzo" })).toBeInTheDocument();
    await user.selectOptions(month as HTMLElement, "3");
    expect(screen.getByTestId("out")).toHaveTextContent("2021-3");
    await user.selectOptions(year as HTMLElement, "");
    expect(screen.getByTestId("out")).toHaveTextContent("-");
    expect(month).toBeDisabled();
  });
});

describe("Autocomplete", () => {
  function Harness({ own = [] }: { own?: string[] }) {
    const [value, setValue] = useState("");
    return <Autocomplete label="Role" value={value} onChange={setValue} options={ROLE_OPTIONS} own={own} />;
  }

  it("suggests curated values as you type and fills the field on click", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    await user.type(screen.getByRole("combobox", { name: "Role" }), "devops");
    await user.click(screen.getByRole("option", { name: "DevOps Engineer" }));
    expect(screen.getByRole("combobox", { name: "Role" })).toHaveValue("DevOps Engineer");
  });

  it("offers the user's own earlier values and keeps free text valid", async () => {
    const user = userEvent.setup();
    wrap(<Harness own={["Zeta Labs Lead"]} />);
    const input = screen.getByRole("combobox", { name: "Role" });
    await user.type(input, "zeta");
    expect(screen.getByRole("option", { name: "Zeta Labs Lead" })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "Something unusual");
    expect(input).toHaveValue("Something unusual");
  });
});

describe("technology suggestions", () => {
  it("'gi' lists Git, GitHub and GitLab among the first five", () => {
    const labels = searchOptions(STACK_OPTIONS, "gi").map((option) => option.label);
    expect(labels).toEqual(expect.arrayContaining(["Git", "GitHub", "GitLab"]));
    expect(labels.slice(0, 5)).toEqual(expect.arrayContaining(["Git", "GitHub", "GitLab"]));
  });
});
