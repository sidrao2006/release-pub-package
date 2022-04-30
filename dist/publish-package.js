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
const exec = __importStar(require("@actions/exec"));
const utils_1 = require("./utils");
const fs_1 = __importDefault(require("fs"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        // Publish package
        yield publishPackageToPub(yield getActionInputs());
    });
}
run();
function getActionInputs() {
    return __awaiter(this, void 0, void 0, function* () {
        let inputs;
        try {
            inputs = {
                prePublishCommand: core.getInput('pre-publish-command'),
                postPublishCommand: core.getInput('post-publish-command'),
                shouldRunPubScoreTest: core.getInput('should-run-pub-score-test').toUpperCase() === 'TRUE',
                pubScoreMinPoints: Number.parseInt(core.getInput('pub-score-min-points')),
                accessToken: core.getInput('access-token'),
                refreshToken: core.getInput('refresh-token'),
                idToken: core.getInput('id-token'),
                tokenEndpoint: core.getInput('token-endpoint'),
                expiration: core.getInput('expiration'),
                pubCredentialsFile: core.getInput('pub-credentials-file')
            };
        }
        catch (err) {
            core.setFailed(err);
            inputs = {};
        }
        return inputs;
    });
}
function publishPackageToPub(inputs) {
    return __awaiter(this, void 0, void 0, function* () {
        const { prePublishCommand, postPublishCommand, shouldRunPubScoreTest, pubScoreMinPoints } = inputs;
        yield (0, utils_1.execCommand)(prePublishCommand);
        if (shouldRunPubScoreTest)
            yield runPanaTest(pubScoreMinPoints);
        // Setup auth for pub
        setUpPubAuth(inputs);
        yield exec.exec('flutter', ['pub', 'publish', '--force']);
        yield (0, utils_1.execCommand)(postPublishCommand);
    });
}
function setUpPubAuth(inputs) {
    const { accessToken, refreshToken, idToken, tokenEndpoint, expiration, pubCredentialsFile } = inputs;
    if (!((accessToken && refreshToken && idToken && tokenEndpoint && expiration) ||
        pubCredentialsFile))
        core.setFailed('Neither tokens nor the credential file was found to authorize with pub');
    const credentials = pubCredentialsFile || {
        accessToken,
        refreshToken,
        idToken,
        tokenEndpoint,
        scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email'],
        expiration: Number.parseInt(expiration)
    };
    if (process.platform === 'win32') {
        const pubCacheDir = `${process.env.APPDATA}/Pub/Cache`;
        if (!fs_1.default.existsSync(pubCacheDir))
            fs_1.default.mkdirSync(pubCacheDir);
        fs_1.default.writeFileSync(`${pubCacheDir}/credentials.json`, JSON.stringify(credentials));
    }
    else {
        const pubCacheDir = `${process.env.FLUTTER_ROOT}/.pub-cache`;
        if (!fs_1.default.existsSync(pubCacheDir))
            fs_1.default.mkdirSync(pubCacheDir);
        fs_1.default.writeFileSync(`${pubCacheDir}/credentials.json`, JSON.stringify(credentials));
    }
}
function runPanaTest(pubScoreMinPoints) {
    return __awaiter(this, void 0, void 0, function* () {
        let panaOutput = '';
        yield exec.exec('flutter', ['pub', 'global', 'activate', 'pana']);
        yield exec.exec('flutter', [
            'pub',
            'global',
            'run',
            'pana',
            process.env.GITHUB_WORKSPACE || '.',
            '--json',
            '--no-warning'
        ], {
            listeners: {
                stdout: data => {
                    if (data.toString())
                        panaOutput += data.toString();
                }
            }
        });
        if (panaOutput.includes('undefined'))
            panaOutput = panaOutput.replace('undefined', '');
        const panaResult = JSON.parse(panaOutput);
        if (isNaN(pubScoreMinPoints))
            core.setFailed('run-pub-score-test was set to true but no value for pub-score-min-points was provided');
        if (panaResult.scores.grantedPoints < pubScoreMinPoints) {
            for (const test of panaResult.report.sections) {
                if (test.status !== 'passed')
                    core.warning(`${test.title}\n\n\n${test.summary}`);
            }
            core.error('Pub score test failed');
        }
    });
}
