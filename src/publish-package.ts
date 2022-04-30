import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {PanaJSON, PubAuthInputs, PublishInputs, execCommand} from './utils'
import fs from 'fs'

async function run(): Promise<void> {
  // Publish package
  await publishPackageToPub(await getActionInputs())
}

run()

async function getActionInputs(): Promise<PubAuthInputs & PublishInputs> {
  let inputs: PubAuthInputs & PublishInputs

  try {
    inputs = {
      prePublishCommand: core.getInput('pre-publish-command'),
      postPublishCommand: core.getInput('post-publish-command'),
      shouldRunPubScoreTest:
        core.getInput('should-run-pub-score-test').toUpperCase() === 'TRUE',
      pubScoreMinPoints: Number.parseInt(core.getInput('pub-score-min-points')),
      accessToken: core.getInput('access-token'),
      refreshToken: core.getInput('refresh-token'),
      idToken: core.getInput('id-token'),
      tokenEndpoint: core.getInput('token-endpoint'),
      expiration: core.getInput('expiration'),
      pubCredentialsFile: core.getInput('pub-credentials-file')
    }
  } catch (err: any) {
    core.setFailed(err)
    inputs = {} as PubAuthInputs & PublishInputs
  }

  return inputs
}

async function publishPackageToPub(
  inputs: PublishInputs & PubAuthInputs
): Promise<void> {
  const {
    prePublishCommand,
    postPublishCommand,
    shouldRunPubScoreTest,
    pubScoreMinPoints
  } = inputs

  await execCommand(prePublishCommand)

  if (shouldRunPubScoreTest) await runPanaTest(pubScoreMinPoints)

  // Setup auth for pub

  setUpPubAuth(inputs)

  await exec.exec('flutter', ['pub', 'publish', '--force'])

  await execCommand(postPublishCommand)
}

function setUpPubAuth(inputs: PubAuthInputs): void {
  const {
    accessToken,
    refreshToken,
    idToken,
    tokenEndpoint,
    expiration,
    pubCredentialsFile
  } = inputs

  if (
    !(
      (accessToken && refreshToken && idToken && tokenEndpoint && expiration) ||
      pubCredentialsFile
    )
  )
    core.setFailed(
      'Neither tokens nor the credential file was found to authorize with pub'
    )

  const credentials = pubCredentialsFile || {
    accessToken,
    refreshToken,
    idToken,
    tokenEndpoint,
    scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email'],
    expiration: Number.parseInt(expiration)
  }

  if (process.platform === 'win32') {
    const pubCacheDir = `${process.env.APPDATA}/Pub/Cache`

    if (!fs.existsSync(pubCacheDir)) fs.mkdirSync(pubCacheDir)

    fs.writeFileSync(
      `${pubCacheDir}/credentials.json`,
      JSON.stringify(credentials)
    )
  } else {
    const pubCacheDir = `${process.env.FLUTTER_ROOT}/.pub-cache`

    if (!fs.existsSync(pubCacheDir)) fs.mkdirSync(pubCacheDir)

    fs.writeFileSync(
      `${pubCacheDir}/credentials.json`,
      JSON.stringify(credentials)
    )
  }
}

async function runPanaTest(pubScoreMinPoints: number): Promise<void> {
  let panaOutput = ''

  await exec.exec('flutter', ['pub', 'global', 'activate', 'pana'])

  await exec.exec(
    'flutter',
    [
      'pub',
      'global',
      'run',
      'pana',
      process.env.GITHUB_WORKSPACE || '.',
      '--json',
      '--no-warning'
    ],
    {
      listeners: {
        stdout: data => {
          if (data.toString()) panaOutput += data.toString()
        }
      }
    }
  )

  if (panaOutput.includes('undefined'))
    panaOutput = panaOutput.replace('undefined', '')

  const panaResult: PanaJSON = JSON.parse(panaOutput)

  if (isNaN(pubScoreMinPoints))
    core.setFailed(
      'run-pub-score-test was set to true but no value for pub-score-min-points was provided'
    )

  if (panaResult.scores.grantedPoints < pubScoreMinPoints) {
    for (const test of panaResult.report.sections) {
      if (test.status !== 'passed')
        core.warning(`${test.title}\n\n\n${test.summary}`)
    }
    core.error('Pub score test failed')
  }
}
