# Music Visual Schedule

A Windows desktop app for elementary music teachers, including Special Education/ASD and General Music classrooms. Create reusable class routines, add ordered activity steps with images and optional presentations or audio, and display the active step on a classroom screen.

## Download

Download the latest **MusicVisualSchedule-Setup** installer from the [GitHub Releases](https://github.com/pconniff1-tech/Elementary-Music-Visual-Schedule-App/releases) page. The installer supports Windows x64 and arm64 computers.

## Features

- Create and edit multiple classroom schedules.
- Add image-based activity steps and reorder them.
- Display Google Slides, Canva, and supported audio links.
- Advance or reverse the schedule using the keyboard or a presentation clicker.
- Store schedules and image files locally on the computer.
- Check for, download, and install updates from the app's setup panel.

Schedule data and imported images are stored in the current user's Electron application-data folder and are not uploaded by the app.

## Run from source

Requirements: Node.js and npm.

```powershell
npm install
npm start
```

Run the tests with:

```powershell
npm test
npm run test:db
```

## Build for Windows

Create a local universal NSIS installer (x64 and arm64):

```powershell
npm run build:local
```

The installer is written to `dist/`. To publish a GitHub release, use the release process below.

## Publishing a release

Releases are published to this repository and power in-app update checks.

1. Set `GH_TOKEN` in a local root `.env` file. The token needs repository **Contents: read and write** access. Never commit or share the token.
2. Update the version in `package.json` and run `npm install` to update `package-lock.json`.
3. Run:

   ```powershell
   npm run build:release
   ```

4. Verify the published release is available from the [Releases page](https://github.com/pconniff1-tech/Elementary-Music-Visual-Schedule-App/releases).

The release must be published (not a draft) for installed copies of the app to find it. Updating is available in packaged installations; `npm start` does not check for updates.

## License

This project is licensed under the ISC License. See [LICENSE](LICENSE).
