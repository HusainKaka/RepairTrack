# RepairTrack Run and GitHub Submission Guide

## Part A: Running the App Locally

### 1. Install PHP
Install PHP 8 or later. On Windows, you can install XAMPP or standalone PHP. On macOS, PHP can be installed using Homebrew. On Linux, install PHP using your package manager.

### 2. Extract the Project
Extract the ZIP file and open the folder named `RepairTrack_Complete_Week13`.

### 3. Initialize Demo Data
Open a terminal in the project folder and run:

```bash
php scripts/init_demo.php
```

### 4. Start the Server
Run:

```bash
php -S localhost:8000 -t public
```

### 5. Open the App
Open your browser and visit:

```text
http://localhost:8000
```

### 6. Login Details

Administrator:

```text
Username: admin
Password: admin123
```

Technician:

```text
Username: tech
Password: tech123
```

### 7. Test the Prototype
Run:

```bash
php tests/smoke_test.php
```

## Part B: What to Upload to GitHub

Upload the whole project folder, especially:

```text
public/
src/
data/ demo files only
database/
scripts/
tests/
docs/
.github/
README.md
.gitignore
```

Do not upload real customer data, real passwords, `.env` files, private device serial numbers, database backups, or cache files.

## Part C: Uploading with Git Commands

### 1. Create GitHub Repository
Create a new repository named:

```text
RepairTrack
```

Recommended visibility: Private, unless your lecturer requests a public repository.

### 2. Initialize Git
From the project folder, run:

```bash
git init
git add .
git commit -m "Initial commit: RepairTrack Week 13 project"
git branch -M main
git remote add origin https://github.com/YOURUSERNAME/RepairTrack.git
git push -u origin main
```

### 3. Create Develop Branch

```bash
git checkout -b develop
git push -u origin develop
```

### 4. Create GitFlow Feature Branches

```bash
git checkout -b feature/authentication
git checkout develop
git checkout -b feature/device-intake
git checkout develop
git checkout -b feature/customer-lookup
git checkout develop
git checkout -b feature/reports-and-audit
```

Use pull requests to merge feature branches into `develop`, then merge `develop` into `main` for final release.

## Part D: GitHub Project Board

Create a GitHub Project named:

```text
RepairTrack Development Board
```

Recommended columns:

```text
Backlog
To Do
In Progress
Review
Done
```

Add issues for the user stories listed in the design document and README.

## Part E: Final Submission Checklist

- Repository uploaded successfully.
- README visible on GitHub.
- App runs locally.
- Smoke test passes.
- Design document is inside `docs/`.
- Concept paper is inside `docs/`.
- GitHub board created.
- First two sprint user stories created with story points.
- Student ID placeholder replaced.
- GitHub URL added to submitted document.
