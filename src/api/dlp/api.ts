import {DLP_HEADERS} from './request.ts';
import {DlpPolicy} from "./dlp-policy.interface.ts";
import type {SendMessageParams} from "../../types";
import {GlobalState} from "../../global/types";

export class DLP {
  private static agentServer = 'http://localhost:3555';

  static async checkMessage(global: GlobalState, params: SendMessageParams): Promise<boolean> {
    console.log(global, params);
    return new Promise(() => true);
  }

  static sendMessage() {

  }

  static async init(): Promise<DlpPolicy> {
    return fetch(`${DLP.agentServer}/system`, { headers: DLP_HEADERS })
      .then((res) => res.json())
      .catch((err) => {
        return {
          isBlockIfOffline: true,
          blockMessage: 'Передача заблокирована. Обратитесь к администратору.',
          telegram: true,
        };
      });
  }
}
