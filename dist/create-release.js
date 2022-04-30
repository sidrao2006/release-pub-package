"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const utils_1 = require("./utils");
const action_1 = require("@octokit/action");
const fs_1 = __importDefault(require("fs"));
const changelog_parser_1 = __importDefault(require("changelog-parser"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = new action_1.Octokit();
        // Get inputs from workflow
        const { previousVersion, changelogFilePath, isDraft, preReleaseCommand, postReleaseCommand } = yield getActionInputs(octokit);
        // Get Changelog file path
        const changelogFile = changelogFilePath || `${process.env.GITHUB_WORKSPACE}/CHANGELOG.md`;
        // Get latest version and release notes from changelog
        const originalData = addFakeChangelogHeading(changelogFile);
        let version = '';
        let body = '';
        yield (0, changelog_parser_1.default)(changelogFile, (_, changelog) => ({ version, body } = changelog.versions[0]));
        removeFakeChangelogHeading(changelogFile, originalData);
        // Check if latest version in changelog has already been released
        if (version === previousVersion) {
            core.warning(`No new version found. Latest version in Changelog (${version}) is the same as the previous version.`);
            process.exit(core.ExitCode.Success);
        }
        // Create a release
        yield createRelease(octokit, {
            preReleaseCommand,
            postReleaseCommand,
            isDraft,
            version,
            body
        });
    });
}
process.on('unhandledRejection', err => {
    throw err;
});
run();
// Helper functions
function getActionInputs(octokit = new action_1.Octokit()) {
    return __awaiter(this, void 0, void 0, function* () {
        let inputs;
        try {
            inputs = {
                previousVersion: core.getInput('previous-version') ||
                    (yield getLatestReleaseVersion(octokit)),
                changelogFilePath: core.getInput('changelog-file'),
                isDraft: core.getInput('is-draft').toUpperCase() === 'TRUE',
                preReleaseCommand: core.getInput('pre-release-command'),
                postReleaseCommand: core.getInput('post-release-command')
            };
        }
        catch (err) {
            core.setFailed(err);
            inputs = {};
        }
        return inputs;
    });
}
function getLatestReleaseVersion(octokit = new action_1.Octokit()) {
    return __awaiter(this, void 0, void 0, function* () {
        const { owner, repo } = github.context.repo;
        const releases = yield octokit.rest.repos.listReleases({ owner, repo });
        return releases.data.length > 0
            ? releases.data[0].tag_name.replace('v', '')
            : '0.0.0'; // undefined or null can also be returned from this step
    });
}
function addFakeChangelogHeading(changelogFile) {
    const data = fs_1.default.readFileSync(changelogFile);
    const fd = fs_1.default.openSync(changelogFile, 'w+');
    const buffer = Buffer.from('# Fake Heading\n\n');
    fs_1.default.writeSync(fd, buffer, 0, buffer.length, 0); // write new data
    fs_1.default.appendFileSync(changelogFile, data); // append old data
    fs_1.default.closeSync(fd);
    return data;
}
function removeFakeChangelogHeading(changelogFile, originalData) {
    const fd = fs_1.default.openSync(changelogFile, 'w+');
    fs_1.default.writeSync(fd, originalData, 0, originalData.length, 0); // rewrite the original file
    fs_1.default.closeSync(fd);
}
function createRelease(octokit = new action_1.Octokit(), { preReleaseCommand, postReleaseCommand, isDraft, version, body }) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, utils_1.execCommand)(preReleaseCommand);
        const { owner, repo } = github.context.repo;
        yield octokit.rest.repos.createRelease({
            owner,
            repo,
            name: `v${version}`,
            tag_name: `v${version}`,
            target_commitish: github.context.sha,
            body,
            draft: isDraft,
            prerelease: version.includes('-')
        });
        yield (0, utils_1.execCommand)(postReleaseCommand);
    });
}
