import * as vscode from 'vscode';
import { getConfiguration } from '../configuration';
import { IndexAdapter } from '../index/index-adapter';
import { Runner } from '../runner';
import { Command } from './command';

export class ValidateCommand extends Command {
  constructor(private index: IndexAdapter, private runner: Runner) {
    super("validate");
  }

  protected async perform(): Promise<any> {
    const path = getConfiguration().path;

    try {
      for (const group of this.index.index.groups) {
        this.logger.info(`Validating group ${group.uri.toString()}`);
        const output = await this.runner.run({}, "validate", "-no-color", group.uri.fsPath);
        for (const line of output.split('\n')) {
          this.logger.info("output: ", line);
        }
      }
    } catch (err) {
      this.logger.warn("Validation failed: ", err);
      return await vscode.window.showErrorMessage("Validation failed, more information in the output tab.");
    }
  }
}