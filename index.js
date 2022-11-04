const puppeteer = require("puppeteer");
require("dotenv").config();

fs = require("fs");

(async () => {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	await page.goto("https://moodle2.csis.ul.ie/login/index.php");
	await page.type("#username", process.env.USERNAME);
	await page.type("#password", process.env.PASSWORD);
	await page.click("#loginbtn");
	await page.waitForNavigation();
	await page.goto("https://moodle2.csis.ul.ie/course/view.php?id=189");

	const assignmentsSelector = ".modtype_assign";
	await page.waitForSelector(assignmentsSelector);

	const assignments = await page.evaluate((assignmentsSelector) => {
		return [...document.querySelectorAll(assignmentsSelector)].map((anchor) => {
			const assignment = anchor
				.querySelector(".instancename")
				.innerText.slice(0, -11);
			const link = anchor.querySelector("a").href;
			const id = link.slice(link.indexOf("id=") + 3);
			return { id, assignment, link };
		});
	}, assignmentsSelector);

	for (const assignment of assignments) {
		await page.goto(assignment.link);
		const table = await page.$(".generaltable");
		await page.waitForSelector(".generaltable");
		assignment.deadline = 0;
		const tableData = await page.evaluate((table) => {
			return [...table.querySelectorAll("tr")].map((row) => {
				return [...row.querySelectorAll("td")]
					.map((cell) => {
						return cell.innerText;
					})
					.toString();
			});
		}, table);

		for (const col of tableData) {
			if (
				assignment.deadline == 0 &&
				Date.parse(col) &&
				Date.parse(col) != 978307200000 &&
				!col.includes("Group")
			) {
				idx = tableData.indexOf(col);

				assignment.deadline = col;
				assignment.submission = tableData[idx + 1];
				assignment.graded = tableData[idx - 1];
				assignment.status = tableData[idx - 2];
				break;
			}
		}
	}

	await fs.writeFile("assignments.json", JSON.stringify(assignments), (err) => {
		if (err) throw err;
	});

	await browser.close();
})();
