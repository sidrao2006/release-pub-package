import * as exec from '@actions/exec'

export async function execCommand(command: string): Promise<void> {
  if (command) {
    const commandAndArgs = command.split(' ')

    const parsedCommand = {
      commandLine: commandAndArgs[0],
      args: commandAndArgs.slice(1)
    }

    await exec.exec(parsedCommand.commandLine, parsedCommand.args)
  }
}

export interface ReleaseInputs {
  previousVersion: string
  changelogFilePath: string
  isDraft: boolean
  preReleaseCommand: string
  postReleaseCommand: string
}

export interface PubAuthInputs {
  accessToken: string
  refreshToken: string
  idToken: string
  tokenEndpoint: string
  expiration: string
  pubCredentialsFile: string
}

export interface PublishInputs {
  prePublishCommand: string
  postPublishCommand: string
  shouldRunPubScoreTest: boolean
  pubScoreMinPoints: number
}

export interface PanaJSON {
  scores: {
    grantedPoints: number
  }
  report: {
    sections: {
      status: 'passed' | 'partial' | 'failed'
      title: string
      summary: string
    }[]
  }
}
