<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->
- [x] Verify that the copilot-instructions.md file in the .github directory is created.

- [x] Clarify Project Requirements
	<!-- User requested a Python Home Assistant integration based on the Grainfather web API. -->

- [x] Scaffold the Project
	<!-- Created a Python project structure manually because no project setup scaffold was available. -->

- [x] Customize the Project
	<!-- Added a Home Assistant custom integration scaffold for Grainfather with API client, coordinator, config flow, and sensors. -->

- [x] Install Required Extensions
	<!-- No project setup info returned extension requirements, so no extensions were installed. -->

- [x] Compile the Project
	<!-- Bytecode compilation succeeded for the integration and tests. -->

- [x] Create and Run Task
	<!-- No task was added because this scaffold does not require a dedicated VS Code task yet. -->

- [x] Launch the Project
	<!-- Skipped because the user did not ask to launch or debug Home Assistant. -->

- [x] Ensure Documentation is Complete
	<!-- README was added with setup scope and next steps. -->

- Use Home Assistant custom component structure under custom_components/grainfather.
- Keep the Grainfather API layer isolated from Home Assistant entity logic.
- Prefer minimal, testable code that is easy to extend once the live API contract is confirmed.