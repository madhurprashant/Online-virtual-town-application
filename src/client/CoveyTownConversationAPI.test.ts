import CORS from 'cors';

import Express from 'express';

import http from 'http';

import { nanoid } from 'nanoid';

import { AddressInfo } from 'net';

import { mock, mockReset } from 'jest-mock-extended';

import CoveyTownController from '../lib/CoveyTownController';

import CoveyTownsStore from '../lib/CoveyTownsStore';

import addTownRoutes from '../router/towns';

import * as requestHandlers from '../requestHandlers/CoveyTownRequestHandlers';

import { createConversationForTesting } from './TestUtils';

import TownsServiceClient, { ServerConversationArea } from './TownsServiceClient';
import PlayerSession from '../types/PlayerSession';
import Player from '../types/Player';

type TestTownData = {
  friendlyName: string;

  coveyTownID: string;

  isPubliclyListed: boolean;

  townUpdatePassword: string;
};

describe('Create Conversation Area API', () => {
  let server: http.Server;

  let apiClient: TownsServiceClient;

  async function createTownForTesting(
    friendlyNameToUse?: string,

    isPublic = false,
  ): Promise<TestTownData> {
    const friendlyName =
      friendlyNameToUse !== undefined
        ? friendlyNameToUse
        : `${isPublic ? 'Public' : 'Private'}TestingTown=${nanoid()}`;

    const ret = await apiClient.createTown({
      friendlyName,

      isPubliclyListed: isPublic,
    });

    return {
      friendlyName,

      isPubliclyListed: isPublic,

      coveyTownID: ret.coveyTownID,

      townUpdatePassword: ret.coveyTownPassword,
    };
  }

  beforeAll(async () => {
    const app = Express();

    app.use(CORS());

    server = http.createServer(app);

    addTownRoutes(server, app);

    await server.listen();

    const address = server.address() as AddressInfo;

    apiClient = new TownsServiceClient(`http://127.0.0.1:${address.port}`);
  });

  afterAll(async () => {
    await server.close();
  });

  it('Executes without error when creating a new conversation', async () => {
    const testingTown = await createTownForTesting(undefined, true);

    const testingSession = await apiClient.joinTown({
      userName: nanoid(),

      coveyTownID: testingTown.coveyTownID,
    });

    await apiClient.createConversationArea({
      conversationArea: createConversationForTesting(),

      coveyTownID: testingTown.coveyTownID,

      sessionToken: testingSession.coveySessionToken,
    });
  });

  // Represents the tests for the POST api in town.ts in order to catch errors based on when teh createConversationAreaHandler is

  // called

  it('Executes with error when creating a new conversation', async () => {
    const testingTown = await createTownForTesting(undefined, true);

    const testingSession = await apiClient.joinTown({
      userName: nanoid(),

      coveyTownID: testingTown.coveyTownID,
    });

    const convAreaTesting = createConversationForTesting();

    jest.spyOn(requestHandlers, 'conversationAreaCreateHandler').mockImplementationOnce(() => {
      throw new Error('Error thrown in the case of this creation of conversation create handler');
    });

    try {
      await apiClient.createConversationArea({
        conversationArea: convAreaTesting,

        coveyTownID: testingTown.coveyTownID,

        sessionToken: testingSession.coveySessionToken,
      });
    } catch (error) {
      const responseMessage = 'Request failed with status code 500';
      expect(error).toEqual(new Error(responseMessage));
    }
  });

  it('Executes with error when creating a new conversation due to invalid session and town', async () => {
    const testingTown = await createTownForTesting('givenTown', true);

    const testingSession = await apiClient.joinTown({
      userName: nanoid(),

      coveyTownID: testingTown.coveyTownID,
    });

    try {
      await apiClient.createConversationArea({
        conversationArea: createConversationForTesting(),

        coveyTownID: testingTown.coveyTownID,
        sessionToken: testingSession.coveySessionToken,
      });
    } catch (error) {
      expect(error).toEqual('Internal server error, please see log in server for more details');
    }
  });
});

describe('conversationAreaCreateHandler', () => {
  const mockCoveyTownStore = mock<CoveyTownsStore>();

  const mockCoveyTownController = mock<CoveyTownController>();

  beforeAll(() => {
    // Set up a spy for CoveyTownsStore that will always return our mockCoveyTownsStore as the singleton instance

    jest.spyOn(CoveyTownsStore, 'getInstance').mockReturnValue(mockCoveyTownStore);
  });

  beforeEach(() => {
    // Reset all mock calls, and ensure that getControllerForTown will always return the same mock controller

    mockReset(mockCoveyTownController);

    mockReset(mockCoveyTownStore);

    mockCoveyTownStore.getControllerForTown.mockReturnValue(mockCoveyTownController);
  });

  it('Checks for a invalid session token before creating a conversation area', () => {
    const coveyTownID = nanoid();

    const conversationArea: ServerConversationArea = {
      boundingBox: { height: 1, width: 1, x: 1, y: 1 },

      label: nanoid(),

      occupantsByID: [],

      topic: nanoid(),
    };

    const invalidSessionToken = nanoid();

    // Make sure to return 'undefined' regardless of what session token is passed

    mockCoveyTownController.getSessionByToken.mockReturnValueOnce(undefined);

    const action = requestHandlers.conversationAreaCreateHandler({
      conversationArea,

      coveyTownID,

      sessionToken: invalidSessionToken,
    });

    const response = {
      isOK: false,
      response: {},
      message: `Unable to create conversation area ${conversationArea.label} with topic ${conversationArea.topic}`,
    };

    expect(action).toEqual(response);
    expect(mockCoveyTownController.addConversationArea).not.toHaveBeenCalled();
  });

  it('Checks for a valid conversation area before creating a conversation area actually', () => {
    const coveyTownID = nanoid();
    const mockSession = new PlayerSession(new Player(nanoid()));

    const conversationArea = {
      label: 'newConversationArea1 Label',
      topic: 'newConversationArea1 Topic',
      occupantsByID: [],
      boundingBox: { x: 10, y: 10, height: 5, width: 5 },
    };

    // Make sure to return 'undefined' regardless of what session token is passed

    const addSession = mockCoveyTownController.getSessionByToken.mockReturnValueOnce(mockSession);
    expect(addSession).toBeTruthy();

    const action = requestHandlers.conversationAreaCreateHandler({
      conversationArea,

      coveyTownID,

      sessionToken: mockSession.sessionToken,
    });

    const success = mockCoveyTownController.addConversationArea(conversationArea);

    const responseToConversationArea = {
      isOK: success,
      response: {},
      message: !success
        ? `Unable to create conversation area ${conversationArea.label} with topic ${conversationArea.topic}`
        : undefined,
    };

    const responseToConversationArea1 = {
      isOK: success,
      response: {},
      message: success
        ? `Unable to create conversation area ${conversationArea.label} with topic ${conversationArea.topic}`
        : undefined,
    };

    const responseToConversationArea2 = {
      isOK: success,
      response: {},
      message: !success ? '' : undefined,
    };

    expect(action).toEqual(responseToConversationArea);
    expect(action).not.toEqual(responseToConversationArea1);
    expect(action).not.toEqual(responseToConversationArea2);
    expect(mockCoveyTownController.addConversationArea).toHaveBeenCalledTimes(2);
    expect(mockCoveyTownController.addConversationArea).toHaveBeenCalledWith(conversationArea);
  });

  // Represents the case of checking when the conversation area is invalid in the case of which, an error should be thrown
  it('Checks for an invalid conversation area to be added, in the case of which, an error is supposed to be thrown', () => {
    const coveyTownID = nanoid();
    const mockSession = new PlayerSession(new Player(nanoid()));

    const conversationArea: ServerConversationArea = {
      boundingBox: { height: 0, width: 0, x: 1, y: 1 },

      label: nanoid(),

      occupantsByID: [],

      topic: '',
    };

    // Make sure to return 'undefined' regardless of what session token is passed

    mockCoveyTownController.addConversationArea.mockReturnValueOnce(false);
    const action = requestHandlers.conversationAreaCreateHandler({
      conversationArea,

      coveyTownID,

      sessionToken: mockSession.sessionToken,
    });

    // const failure = mockCoveyTownController.addConversationArea(conversationArea);

    const responseToConversationArea = {
      isOK: false,
      response: {},
      message: `Unable to create conversation area ${conversationArea.label} with topic ${conversationArea.topic}`,
    };

    expect(action).toEqual(responseToConversationArea);
    expect(mockCoveyTownController.addConversationArea).toHaveBeenCalledTimes(0);
    expect(mockCoveyTownController.addConversationArea).not.toHaveBeenCalledWith(conversationArea);
  });
});
