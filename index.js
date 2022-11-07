#!/usr/bin/env node

import puppeteer from "puppeteer";
import chalk from "chalk";
import inquirer from "inquirer";
import { createSpinner } from "nanospinner";
import figlet from "figlet";

let run = true;
let assignments = [];
let stayInModule = true;

const welcome = () => {
	console.clear();
	console.log(figlet.textSync("IGLOO"));
	console.log(
		chalk.bold("💪 Keep track of your Moodle Assignments!\n ") +
			chalk.italic("Created by: Adam Byrne \n") +
			chalk.gray("For CSIS students at the University of Limerick \n")
	);
};

const login = async (page) => {
	const username = await inquirer.prompt({
		type: "input",
		name: "username",
		message: "Enter your username/email",
	});
	const password = await inquirer.prompt({
		type: "password",
		name: "password",
		message: "Enter your password",
		mask: true,
	});
	const spinner = createSpinner("Logging in ...").start();

	if (page.url() != "https://moodle2.csis.ul.ie/login/index.php") {
		await page.goto("https://moodle2.csis.ul.ie/login/index.php");
	}
	await page.type("#username", username.username);
	await page.type("#password", password.password);
	await page.click("#loginbtn");

	await page.waitForNavigation();
	if (page.url() === "https://moodle2.csis.ul.ie/login/index.php") {
		spinner.error({ text: chalk.red("Login failed, please try again.") });
		await login(page);
		return;
	} else {
		spinner.success({ text: chalk.green("Logged in as " + username.username) });
	}
};

const profile = async (page) => {
	const profileURLSelector = "#page-footer > div > div.logininfo > a";
	await page.waitForSelector(profileURLSelector);
	const profileURL = await page.evaluate((profileURLSelector) => {
		return document.querySelector(profileURLSelector).href;
	}, profileURLSelector);
	return profileURL;
};

const loadModuleSelection = async (page, profileURL) => {
	const spinner = createSpinner("Loading module selection").start();
	await page.goto(profileURL);
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

	spinner.success({ text: chalk.green("Loaded modules") });

	return moduleList;
};

const chooseModule = async (moduleList) => {
	const moduleNames = moduleList.map((k) => k.name);
	const moduleLinks = moduleList.map((k) => k.url);
	const moduleSelection = await inquirer.prompt({
		type: "list",
		name: "choice",
		message: "Select a module",
		choices: moduleNames,
	});

	const url =
		moduleLinks[moduleNames.indexOf(moduleSelection.choice)].split(
			"course="
		)[1];

	return "https://moodle2.csis.ul.ie/course/view.php?id=" + url;
};

const loadAssignmentsList = async (page, moduleURL) => {
	await page.goto(moduleURL);
	const spinner = createSpinner("Finding assignments").start();
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
	spinner.success({ text: chalk.green("Assignments found.") });
	return assignments;
};

const fetchAssignmentsDetails = async (page, assignments) => {
	const spinner = createSpinner("Gathering assignment details").start();

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
	}
	spinner.success({ text: chalk.green("Assignments loaded") });
	return assignments;
};

const todos = (assignments) => {
	let result = [];
	result = assignments.filter(
		(assignment) =>
			assignment.status == "No attempt" &&
			assignment.status !=
				"This assignment does not require you to submit anything online" &&
			assignment.graded != "Graded"
	);
	result.sort((a, b) => {
		return Date.parse(a.deadline) - Date.parse(b.deadline);
	});

	return result;
};

const graded = (assignments) => {
	let result = [];
	result = assignments.filter((assignment) => assignment.graded == "Graded");
	result.sort((a, b) => {
		return Date.parse(b.deadline) - Date.parse(a.deadline);
	});

	return result;
};

const completed = (assignments) => {
	let result = [];
	result = assignments.filter(
		(assignment) => assignment.status == "Submitted for grading"
	);
	result.sort((a, b) => {
		return Date.parse(b.deadline) - Date.parse(a.deadline);
	});

	return result;
};

const displayAssignments = async (assignments) => {
	const view = await inquirer.prompt({
		type: "list",
		name: "view",
		message: "View:",
		choices: [
			"📝 To Do",
			"📋 Graded",
			"📄 Completed",
			"📚 All",
			"⏪ Back",
			"🚪 Exit",
		],
	});

	const tableHeaders = ["assignment", "deadline", "status", "graded"];

	switch (view.view) {
		case "📝 To Do":
			stayInModule = true;
			console.table(todos(assignments), tableHeaders);
			break;
		case "📋 Graded":
			stayInModule = true;
			console.table(graded(assignments), tableHeaders);
			break;
		case "📄 Completed":
			stayInModule = true;
			console.table(completed(assignments), tableHeaders);
			break;
		case "📚 All":
			stayInModule = true;
			console.table(assignments, tableHeaders);
			break;
		case "⏪ Back":
			stayInModule = false;
			break;
		case "🚪 Exit":
			run = false;
			process.exit(0);
	}
};

const chooseAssignmentView = async (assignments) => {
	await displayAssignments(assignments);
};

const chooseModuleView = async (page) => {
	const _profileURL = await profile(page);
	const _moduleList = await loadModuleSelection(page, _profileURL);
	const _moduleURL = await chooseModule(_moduleList);

	const _assignmentList = await loadAssignmentsList(page, _moduleURL);
	assignments = await fetchAssignmentsDetails(page, _assignmentList);
};

(async () => {
	welcome();
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await login(page);
	await chooseModuleView(page);
	while (run) {
		if (!stayInModule) {
			await chooseModuleView(page);
			await chooseAssignmentView(assignments);
		} else {
			await chooseAssignmentView(assignments);
		}
	}

	await browser.close();
})();
