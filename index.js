#!/usr/bin/env node

import puppeteer from "puppeteer";
import chalk from "chalk";
import inquirer from "inquirer";

(async () => {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	const launch = async () => {
		console.clear();
		console.log(
			chalk.bold(
				"\n 🧊 Welcome to the Igloo! \nAccess live assignment stats from your CLI. \n"
			) +
				chalk.italic(
					"\n© Adam Byrne 2022\n github:@theadambyrne \n twitter:@adambxrne \n https://bxrne.com \n\n"
				)
		);
	};

	const fetchModuleNames = async () => {
		const moduleListSelector =
			"#region-main > div > div > div > section:nth-child(3) > ul > li > dl > dd > ul";
		await page.waitForSelector(moduleListSelector);
		const moduleList = await page.evaluate((moduleListSelector) => {
			const modules = [];
			const list = document.querySelector(moduleListSelector).childNodes;
			list.forEach((item) => {
				modules.push({ name: item.innerText, url: item.firstChild.href });
			});
			return modules;
		}, moduleListSelector);

		const moduleNames = [];
		moduleList.forEach((k) => {
			moduleNames.push(k.name);
		});
		return moduleNames;
	};

	const fetchModuleLinks = async () => {
		const moduleListSelector =
			"#region-main > div > div > div > section:nth-child(3) > ul > li > dl > dd > ul";
		await page.waitForSelector(moduleListSelector);
		const moduleList = await page.evaluate((moduleListSelector) => {
			const modules = [];
			const list = document.querySelector(moduleListSelector).childNodes;
			list.forEach((item) => {
				modules.push({ name: item.innerText, url: item.firstChild.href });
			});
			return modules;
		}, moduleListSelector);

		const moduleLinks = [];
		moduleList.forEach((k) => {
			moduleLinks.push(k.url);
		});
		return moduleLinks;
	};

	const loadModule = async () => {
		const moduleNames = await fetchModuleNames();
		const moduleLinks = await fetchModuleLinks();
		const moduleSelection = await inquirer.prompt({
			type: "list",
			name: "choice",
			message: "Choose a module",
			choices: moduleNames,
		});

		const url =
			moduleLinks[moduleNames.indexOf(moduleSelection.choice)].split(
				"course="
			)[1];

		await page.goto("https://moodle2.csis.ul.ie/course/view.php?id=" + url);
	};

	const profile = async () => {
		const profileURLSelector = "#page-footer > div > div.logininfo > a";
		await page.waitForSelector(profileURLSelector);
		const profileURL = await page.evaluate((profileURLSelector) => {
			return document.querySelector(profileURLSelector).href;
		}, profileURLSelector);
		await page.goto(profileURL);
		await loadModule();
	};

	const login = async () => {
		await page.goto("https://moodle2.csis.ul.ie/login/index.php");
		const username = await inquirer.prompt({
			type: "input",
			name: "username",
			message: "Enter your Moodle username or email",
		});
		const password = await inquirer.prompt({
			type: "password",
			name: "password",
			message: "Enter your Moodle password",
			mask: true,
		});
		await page.type("#username", username.username);
		await page.type("#password", password.password);
		await page.click("#loginbtn");
		await page.waitForNavigation();
		if (page.url() === "https://moodle2.csis.ul.ie/login/index.php") {
			console.error("🚨 Login failed.");
			await login();
			return;
		} else {
			console.log("👍 Logged in as " + chalk.underline(username.username));
			await profile();
		}
	};

	await launch();
	await login();

	const assignmentsSelector = ".modtype_assign";
	await page.waitForSelector(assignmentsSelector);

	let todos = [];
	let done = [];
	let graded = [];

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
					.map((cell) => cell.innerText)
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
				let idx = tableData.indexOf(col);

				assignment.deadline = col;
				assignment.submission = tableData[idx + 1];
				assignment.graded = tableData[idx - 1];
				assignment.status = tableData[idx - 2];
				break;
			}
		}
		todos = assignments.filter(
			(assignment) =>
				assignment.status == "No attempt" &&
				assignment.status !=
					"This assignment does not require you to submit anything online" &&
				assignment.graded != "Graded"
		);
		graded = assignments.filter((assignment) => assignment.graded == "Graded");
		done = assignments.filter(
			(assignment) => assignment.status == "Submitted for grading"
		);
	}
	await browser.close();

	// data available here: todos, done, graded and all 'assignments'
	console.log("\n📋 Your assignments:\n");
	console.log(
		chalk.bold(
			`📝 ${todos.length} todo, ${done.length} done, ${graded.length} graded`
		)
	);
})();
