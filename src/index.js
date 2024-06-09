import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import { Octokit } from '@octokit/action'
import parseChangelog from 'changelog-parser'
import fs from 'fs'

async function run() {
   const octokit = new Octokit()

   // Get inputs from workflow

   const inputs = await getActionInputs(octokit)

   // Get Changelog file path

   const changelogFile = inputs.changelogFilePath || `${process.env.GITHUB_WORKSPACE}/CHANGELOG.md`

   // Get latest version and release notes from changelog

   const originalData = addFakeChangelogHeading(changelogFile)

   let version, body

   await parseChangelog(changelogFile, (_, changelog) => {
      version = changelog.versions[0].version
      body = changelog.versions[0].body
   })

   removeFakeChangelogHeading(changelogFile, originalData)

   // Check if latest version in changelog has already been released

   if (version === inputs.previousVersion) {
      core.warning(
         `No new version found. Latest version in Changelog (${version}) is the same as the previous version.`
      )
      process.exit(0)
   }

   // Create a release

   await createRelease(octokit, {
      preReleaseCommand: inputs.preReleaseCommand,
      postReleaseCommand: inputs.postReleaseCommand,
      isDraft: inputs.isDraft,
      version,
      body
   })

   // This Github action no longer supports publishing to pub.dev
   // Please see https://dart.dev/tools/pub/automated-publishing#triggering-automated-publishing-from-github-actions
}

process.on('unhandledRejection', err => { throw err })

run()

// Helper functions

async function getActionInputs(octokit) {
   const inputs = {}

   try {
      inputs.previousVersion = core.getInput('previous-version') || await getLatestReleaseVersion(octokit)

      inputs.changelogFilePath = core.getInput('changelog-file')

      inputs.isDraft = core.getInput('is-draft').toUpperCase() === 'TRUE'

      inputs.preReleaseCommand = core.getInput('pre-release-command')
      inputs.postReleaseCommand = core.getInput('post-release-command')

      inputs.pubCredentialsFile = core.getInput('pub-credentials-file')
   } catch (err) {
      core.setFailed(err)
   }

   return inputs
}

async function getLatestReleaseVersion(octokit) {
   const repo = github.context.repo

   const releases = await octokit.rest.repos.listReleases({
      owner: repo.owner,
      repo: repo.repo
   })

   return releases.data.length > 0
      ? releases.data[0].tag_name.replace('v', '')
      : '0.0.0' // undefined or null can also be returned from this step
}

function addFakeChangelogHeading(changelogFile) {
   const data = fs.readFileSync(changelogFile)
   const fd = fs.openSync(changelogFile, 'w+')
   const buffer = new Buffer.from('# Fake Heading\n\n')

   fs.writeSync(fd, buffer, 0, buffer.length, 0) // write new data

   fs.appendFileSync(changelogFile, data) // append old data

   fs.closeSync(fd)

   return data
}

function removeFakeChangelogHeading(changelogFile, originalData) {
   const fd = fs.openSync(changelogFile, 'w+')

   fs.writeSync(fd, originalData, 0, originalData.length, 0) // rewrite the original file

   fs.closeSync(fd)
}

async function execCommand(command) {
   if (command) {
      const commandAndArgs = command.split(' ')

      const parsedCommand = {
         commandLine: commandAndArgs[0],
         args: commandAndArgs.slice(1)
      }

      await exec.exec(parsedCommand.commandLine, parsedCommand.args)
   }
}

async function createRelease(octokit = new Octokit(), {
   preReleaseCommand,
   postReleaseCommand,
   isDraft,
   version,
   body
}) {
   await execCommand(preReleaseCommand)

   const repo = github.context.repo
   await octokit.rest.repos.createRelease({
      owner: repo.owner,
      repo: repo.repo,
      name: `v${version}`,
      tag_name: `v${version}`,
      target_commitish: github.context.sha,
      body,
      draft: isDraft,
      prerelease: version.includes('-')
   })

   await execCommand(postReleaseCommand)
}
