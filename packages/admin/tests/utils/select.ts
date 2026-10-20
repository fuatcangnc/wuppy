import { screen } from "@testing-library/react";

type Clicker = { click: (element: Element) => Promise<void> };

/** Open a shadcn/Radix select by its label and choose an option by its text. */
export async function chooseSelect(user: Clicker, label: string | RegExp, option: string): Promise<void> {
	await user.click(await screen.findByLabelText(label));
	await user.click(await screen.findByRole("option", { name: option }));
}
