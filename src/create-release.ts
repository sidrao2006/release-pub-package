import * as core from '@actions/core'
import * as github from '@actions/github'
import {ReleaseInputs, execCommand} from './utils'
import {Octokit} from '@octokit/action'
import fs from 'fs'
import parseChangelog from 'changelog-parser'

async function run(): Promise<void> {
  const octokit = new Octokit()

  // Get inputs from workflow

  const {
    previousVersion,
    changelogFilePath,
    isDraft,
    preReleaseCommand,
    postReleaseCommand
  } = await getActionInputs(octokit)

  // Get Changelog file path

  const changelogFile =
    changelogFilePath || `${process.env.GITHUB_WORKSPACE}/CHANGELOG.md`

  // Get latest version and release notes from changelog

  const originalData = addFakeChangelogHeading(changelogFile)

  let version = ''
  let body = ''

  await parseChangelog(
    changelogFile,
    (_, changelog: any) => ({version, body} = changelog.versions[0])
  )

  removeFakeChangelogHeading(changelogFile, originalData)

  // Check if latest version in changelog has already been released

  if (version === previousVersion) {
    core.warning(
      `No new version found. Latest version in Changelog (${version}) is the same as the previous version.`
    )
    process.exit(core.ExitCode.Success)
  }

  // Create a release

  await createRelease(octokit, {
    preReleaseCommand,
    postReleaseCommand,
    isDraft,
    version,
    body
  })
}

process.on('unhandledRejection', err => {
  throw err
})

run()

// Helper functions

async function getActionInputs(
  octokit = new Octokit()
): Promise<ReleaseInputs> {
  let inputs: ReleaseInputs

  try {
    inputs = {
      previousVersion:
        core.getInput('previous-version') ||
        (await getLatestReleaseVersion(octokit)),
      changelogFilePath: core.getInput('changelog-file'),
      isDraft: core.getInput('is-draft').toUpperCase() === 'TRUE',
      preReleaseCommand: core.getInput('pre-release-command'),
      postReleaseCommand: core.getInput('post-release-command')
    }
  } catch (err: any) {
    core.setFailed(err)
    inputs = {} as ReleaseInputs
  }

  return inputs
}

async function getLatestReleaseVersion(
  octokit = new Octokit()
): Promise<string> {
  const {owner, repo} = github.context.repo

  const releases = await octokit.rest.repos.listReleases({owner, repo})

  return releases.data.length > 0
    ? releases.data[0].tag_name.replace('v', '')
    : '0.0.0' // undefined or null can also be returned from this step
}

function addFakeChangelogHeading(changelogFile: string): Buffer {
  const data = fs.readFileSync(changelogFile)
  const fd = fs.openSync(changelogFile, 'w+')
  const buffer = Buffer.from('# Fake Heading\n\n')

  fs.writeSync(fd, buffer, 0, buffer.length, 0) // write new data

  fs.appendFileSync(changelogFile, data) // append old data

  fs.closeSync(fd)

  return data
}

function removeFakeChangelogHeading(
  changelogFile: string,
  originalData: Buffer
): void {
  const fd = fs.openSync(changelogFile, 'w+')

  fs.writeSync(fd, originalData, 0, originalData.length, 0) // rewrite the original file

  fs.closeSync(fd)
}

async function createRelease(
  octokit = new Octokit(),
  {preReleaseCommand, postReleaseCommand, isDraft, version, body}: any
): Promise<void> {
  await execCommand(preReleaseCommand)

  const {owner, repo} = github.context.repo
  await octokit.rest.repos.createRelease({
    owner,
    repo,
    name: `v${version}`,
    tag_name: `v${version}`,
    target_commitish: github.context.sha,
    body,
    draft: isDraft,
    prerelease: version.includes('-')
  })

  await execCommand(postReleaseCommand)
}
