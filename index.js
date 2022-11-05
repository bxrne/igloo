#!/usr/bin/env node

import puppeteer from "puppeteer";
import chalk from "chalk";
import inquirer from "inquirer";
import { createSpinner } from "nanospinner";
import figlet from "figlet";

(async () => {
	const fetchModuleData = async () => {
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
		return moduleList;
	};

	const loadModule = async (data) => {
		const moduleNames = data.map((k) => k.name);
		const moduleLinks = data.map((k) => k.url);
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

		await page.goto("https://moodle2.csis.ul.ie/course/view.php?id=" + url);
	};

	const profile = async () => {
		const profileURLSelector = "#page-footer > div > div.logininfo > a";
		await page.waitForSelector(profileURLSelector);
		const profileURL = await page.evaluate((profileURLSelector) => {
			return document.querySelector(profileURLSelector).href;
		}, profileURLSelector);
		await page.goto(profileURL);
		await loadModule(await fetchModuleData());
	};

	const login = async () => {
		await page.goto("https://moodle2.csis.ul.ie/login/index.php");
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

		await page.type("#username", username.username);
		await page.type("#password", password.password);
		await page.click("#loginbtn");
		await page.waitForNavigation();
		if (page.url() === "https://moodle2.csis.ul.ie/login/index.php") {
			console.error("🚨 Login failed.");
			await page.goto("https://moodle2.csis.ul.ie/");
			await login();
			return;
		} else {
			console.log(
				chalk.green("✅ Logged in as " + chalk.italic(username.username) + "\n")
			);
			await profile();
		}
	};

	const fetchAssignments = async () => {
		const spinner = createSpinner("Fetching data").start();

		const assignmentsSelector = ".modtype_assign";
		await page.waitForSelector(assignmentsSelector);
		const assignments = await page.evaluate((assignmentsSelector) => {
			return [...document.querySelectorAll(assignmentsSelector)].map(
				(anchor) => {
					const assignment = anchor
						.querySelector(".instancename")
						.innerText.slice(0, -11);
					const link = anchor.querySelector("a").href;
					const id = link.slice(link.indexOf("id=") + 3);
					return { id, assignment, link };
				}
			);
		}, assignmentsSelector);
		spinner.success({ text: chalk.green("Fetched data") });
		return assignments;
	};

	const cleanAssignmentsData = async (assignments) => {
		const spinner = createSpinner("Validating data").start();

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
		spinner.success({ text: chalk.green("Validated data") });
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
	const chooseView = async () => {
		const view = await inquirer.prompt({
			type: "list",
			name: "view",
			message: "Retrieve data for:",
			choices: ["📝 To Do", "📋 Graded", "📄 Completed", "📚 All"],
		});

		switch (view.view) {
			case "📝 To Do":
				await displayAssignments(todos(assignments));
				break;
			case "📋 Graded":
				await displayAssignments(graded(assignments));
				break;
			case "📄 Completed":
				await displayAssignments(completed(assignments));
				break;
			case "📚 All":
				await displayAssignments(assignments);
				break;
		}
	};

	const displayAssignments = async (assignments) => {
		console.table(assignments, ["assignment", "deadline", "status"]);
	};

	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	console.clear();
	console.log(figlet.textSync("IGLOO"));
	console.log(
		chalk.bold(" Keep track of your Moodle Assignments!\n ") +
			chalk.italic("Created by: Adam Byrne \n") +
			chalk.gray("For CSIS students at the University of Limerick \n")
	);

	await login();
	const assignmentsList = await fetchAssignments();
	const assignments = await cleanAssignmentsData(assignmentsList);
	await chooseView();
	await browser.close();
})();
