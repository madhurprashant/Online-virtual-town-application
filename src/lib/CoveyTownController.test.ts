import { nanoid } from 'nanoid';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';
import { Socket } from 'socket.io';
import TwilioVideo from './TwilioVideo';
import Player from '../types/Player';
import CoveyTownController from './CoveyTownController';
import CoveyTownListener from '../types/CoveyTownListener';
import { UserLocation } from '../CoveyTypes';
import PlayerSession from '../types/PlayerSession';
import { townSubscriptionHandler } from '../requestHandlers/CoveyTownRequestHandlers';
import CoveyTownsStore from './CoveyTownsStore';
import * as TestUtils from '../client/TestUtils';

const mockTwilioVideo = mockDeep<TwilioVideo>();
jest.spyOn(TwilioVideo, 'getInstance').mockReturnValue(mockTwilioVideo);

function generateTestLocation(): UserLocation {
  return {
    rotation: 'back',
    moving: Math.random() < 0.5,
    x: Math.floor(Math.random() * 100),
    y: Math.floor(Math.random() * 100),
  };
}

describe('CoveyTownController', () => {
  beforeEach(() => {
    mockTwilioVideo.getTokenForTown.mockClear();
  });
  it('constructor should set the friendlyName property', () => {
    const townName = `FriendlyNameTest-${nanoid()}`;
    const townController = new CoveyTownController(townName, false);
    expect(townController.friendlyName).toBe(townName);
  });
  describe('addPlayer', () => {
    it('should use the coveyTownID and player ID properties when requesting a video token', async () => {
      const townName = `FriendlyNameTest-${nanoid()}`;
      const townController = new CoveyTownController(townName, false);
      const newPlayerSession = await townController.addPlayer(new Player(nanoid()));
      expect(mockTwilioVideo.getTokenForTown).toBeCalledTimes(1);
      expect(mockTwilioVideo.getTokenForTown).toBeCalledWith(
        townController.coveyTownID,
        newPlayerSession.player.id,
      );
    });
  });
  describe('town listeners and events', () => {
    let testingTown: CoveyTownController;
    const mockListeners = [
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
    ];
    beforeEach(() => {
      const townName = `town listeners and events tests ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      mockListeners.forEach(mockReset);
    });
    it('should notify added listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);
      const newLocation = generateTestLocation();
      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.updatePlayerLocation(player, newLocation);
      mockListeners.forEach(listener => expect(listener.onPlayerMoved).toBeCalledWith(player));
    });
    it('should notify added listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.destroySession(session);
      mockListeners.forEach(listener =>
        expect(listener.onPlayerDisconnected).toBeCalledWith(player),
      );
    });
    it('should notify added listeners of new players when addPlayer is called', async () => {
      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const player = new Player('test player');
      await testingTown.addPlayer(player);
      mockListeners.forEach(listener => expect(listener.onPlayerJoined).toBeCalledWith(player));
    });
    it('should notify added listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.disconnectAllPlayers();
      mockListeners.forEach(listener => expect(listener.onTownDestroyed).toBeCalled());
    });
    it('should not notify removed listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const newLocation = generateTestLocation();
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.updatePlayerLocation(player, newLocation);
      expect(listenerRemoved.onPlayerMoved).not.toBeCalled();
    });
    it('should not notify removed listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerDisconnected).not.toBeCalled();
    });
    it('should not notify removed listeners of new players when addPlayer is called', async () => {
      const player = new Player('test player');

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      const session = await testingTown.addPlayer(player);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerJoined).not.toBeCalled();
    });

    it('should not notify removed listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.disconnectAllPlayers();
      expect(listenerRemoved.onTownDestroyed).not.toBeCalled();
    });
  });
  describe('townSubscriptionHandler', () => {
    const mockSocket = mock<Socket>();
    let testingTown: CoveyTownController;
    let player: Player;
    let session: PlayerSession;
    beforeEach(async () => {
      const townName = `connectPlayerSocket tests ${nanoid()}`;
      testingTown = CoveyTownsStore.getInstance().createTown(townName, false);
      mockReset(mockSocket);
      player = new Player('test player');
      session = await testingTown.addPlayer(player);
    });
    it('should reject connections with invalid town IDs by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(nanoid(), session.sessionToken, mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    it('should reject connections with invalid session tokens by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, nanoid(), mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    describe('with a valid session token', () => {
      it('should add a town listener, which should emit "newPlayer" to the socket when a player joins', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        await testingTown.addPlayer(player);
        expect(mockSocket.emit).toBeCalledWith('newPlayer', player);
      });
      it('should add a town listener, which should emit "playerMoved" to the socket when a player moves', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.updatePlayerLocation(player, generateTestLocation());
        expect(mockSocket.emit).toBeCalledWith('playerMoved', player);
      });
      it('should add a town listener, which should emit "playerDisconnect" to the socket when a player disconnects', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.destroySession(session);
        expect(mockSocket.emit).toBeCalledWith('playerDisconnect', player);
      });
      it('should add a town listener, which should emit "townClosing" to the socket and disconnect it when disconnectAllPlayers is called', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.disconnectAllPlayers();
        expect(mockSocket.emit).toBeCalledWith('townClosing');
        expect(mockSocket.disconnect).toBeCalledWith(true);
      });
      describe('when a socket disconnect event is fired', () => {
        it('should remove the town listener for that socket, and stop sending events to it', async () => {
          TestUtils.setSessionTokenAndTownID(
            testingTown.coveyTownID,
            session.sessionToken,
            mockSocket,
          );
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            const newPlayer = new Player('should not be notified');
            await testingTown.addPlayer(newPlayer);
            expect(mockSocket.emit).not.toHaveBeenCalledWith('newPlayer', newPlayer);
          } else {
            fail('No disconnect handler registered');
          }
        });
        it('should destroy the session corresponding to that socket', async () => {
          TestUtils.setSessionTokenAndTownID(
            testingTown.coveyTownID,
            session.sessionToken,
            mockSocket,
          );
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            mockReset(mockSocket);
            TestUtils.setSessionTokenAndTownID(
              testingTown.coveyTownID,
              session.sessionToken,
              mockSocket,
            );
            townSubscriptionHandler(mockSocket);
            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
          } else {
            fail('No disconnect handler registered');
          }
        });
      });
      it('should forward playerMovement events from the socket to subscribed listeners', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);
        // find the 'playerMovement' event handler for the socket, which should have been registered after the socket was connected
        const playerMovementHandler = mockSocket.on.mock.calls.find(
          call => call[0] === 'playerMovement',
        );
        if (playerMovementHandler && playerMovementHandler[1]) {
          const newLocation = generateTestLocation();
          player.location = newLocation;
          playerMovementHandler[1](newLocation);
          expect(mockListener.onPlayerMoved).toHaveBeenCalledWith(player);
        } else {
          fail('No playerMovement handler registered');
        }
      });
    });
  });

  describe('addConversationArea', () => {
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it('should add the conversation area to the list of conversation areas', () => {
      const newConversationArea = TestUtils.createConversationForTesting();
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(1);
      expect(areas[0].label).toEqual(newConversationArea.label);
      expect(areas[0].topic).toEqual(newConversationArea.topic);
      expect(areas[0].boundingBox).toEqual(newConversationArea.boundingBox);
    });

    // Represents when the boxes have the same boundaries
    // Represents the adding of players and conversation areas that are invalid
    it('Represents the adding of players and conversation areas that are invalid ', async () => {
      const firstConversationArea = {
        label: 'newConversationArea1 Label',
        topic: 'newConversationArea1 Topic',
        occupantsByID: [],
        boundingBox: { x: 15, y: 10, height: 10, width: 10 },
      };
      const withoutLabelConversationArea = {
        label: 'second',
        topic: 'newConversationArea1',
        occupantsByID: [],
        boundingBox: { x: 25, y: 10, height: 10, width: 10 },
      };
      const firstConversation = testingTown.addConversationArea(firstConversationArea);
      expect(firstConversation).toBeTruthy();
      const withoutLabel = testingTown.addConversationArea(withoutLabelConversationArea);
      expect(withoutLabel).toBeTruthy();
    });

    // Represents the test case to check for the boudning boxes
    it('Represents the checking of the bounding boxes', async () => {
      const firstConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 5, y: 5, height: 50, width: 50 },
      });
      const boundingConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'label of the conversation area',
        conversationTopic: 'newConversationArea1 Topic 2',
        boundingBox: { x: 10, y: 10, height: 50, width: 50 },
      });
      const secondConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'label of the conversation area',
        conversationTopic: 'newConversationArea1 Topic 2',
        boundingBox: { x: 40, y: 40, height: 5, width: 5 },
      });

      // Represents adding the conversation area into the list of areas and then checking with the invalid bounding boxes
      const areas = testingTown.conversationAreas;

      expect(areas.length).toBe(0);
      const addFirst = testingTown.addConversationArea(firstConversationArea);
      expect(addFirst).toBe(true);
      expect(areas.length).toBe(1);
      // Represents returning false since the bounding boxes overlap
      const addBounding = testingTown.addConversationArea(boundingConversationArea);
      expect(addBounding).not.toBeUndefined();
      expect(addBounding).toBe(false);
      expect(areas.length).toBe(1);

      // const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 20,
        y: 20,
        conversationLabel: firstConversationArea.label,
      };

      const addSecond = testingTown.addConversationArea(secondConversationArea);
      expect(addSecond).toBe(true);
      const player = new Player('player');
      const playerAdded = await testingTown.addPlayer(player);
      const playerToTest = new Player('Player to test');
      const playerTest = await testingTown.addPlayer(playerToTest);
      expect(playerTest).toBeTruthy();
      expect(playerAdded).toBeTruthy();
      const playerMoved = testingTown.updatePlayerLocation(player, newLocation);
      expect(playerMoved).toBeUndefined();
      expect(player.activeConversationArea?.label).toEqual(firstConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(firstConversationArea.topic);
      expect(player.activeConversationArea?.boundingBox).toEqual(firstConversationArea.boundingBox);
      expect(firstConversationArea.occupantsByID[0]).toEqual(player.id);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledWith(firstConversationArea);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerMoved).toHaveBeenCalledWith(player);
      });

      expect(player.isWithin(firstConversationArea)).toBe(true);
      // LEFT EDGE CHECK OF THE PLAYER
      const leftEdge: UserLocation = {
        moving: false,
        rotation: 'front',
        x: firstConversationArea.boundingBox.x - firstConversationArea.boundingBox.width / 2,
        y: 20,
        conversationLabel: firstConversationArea.label,
      };
      const playerMoveAgain = testingTown.updatePlayerLocation(player, leftEdge);
      expect(playerMoveAgain).toBeUndefined();
      expect(player.isWithin(firstConversationArea)).toBe(false);
      // RIGHT EDGE CHECK OF THE PLAYER
      const rightEdge: UserLocation = {
        moving: false,
        rotation: 'front',
        x: firstConversationArea.boundingBox.x + firstConversationArea.boundingBox.width / 2,
        y: 20,
        conversationLabel: firstConversationArea.label,
      };
      const playerMoveRight = testingTown.updatePlayerLocation(player, rightEdge);
      expect(playerMoveRight).toBeUndefined();
      expect(player.isWithin(firstConversationArea)).toBe(false);
      // UPPER EDGE CHECK OF THE PLAYER
      const upperEdge: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 20,
        y: firstConversationArea.boundingBox.y + firstConversationArea.boundingBox.height / 2,
        conversationLabel: firstConversationArea.label,
      };
      const playerMoveUp = testingTown.updatePlayerLocation(player, upperEdge);
      expect(playerMoveUp).toBeUndefined();
      expect(player.isWithin(firstConversationArea)).toBe(false);
      // LOWER EDGE CHECK OF THE PLAYER
      const lowerEdge: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 20,
        y: firstConversationArea.boundingBox.y - firstConversationArea.boundingBox.height / 2,
        conversationLabel: firstConversationArea.label,
      };
      const playerMoveDown = testingTown.updatePlayerLocation(player, lowerEdge);
      expect(playerMoveDown).toBeUndefined();
      expect(player.isWithin(firstConversationArea)).toBe(false);
      // OUTSIDE OF THE ENTIRE BOX CHECK OF THE PLAYER
      const outerLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 40,
        y: 40,
        conversationLabel: secondConversationArea.label,
      };
      // Represents the test case of when the player is moved to another location outside of the bounding box
      const movePlayerOut = testingTown.updatePlayerLocation(player, outerLocation);
      expect(movePlayerOut).toBeUndefined();
      expect(player.isWithin(firstConversationArea)).toBe(false);
      expect(player.isWithin(secondConversationArea)).toBe(true);
    });

    it('Represents the checking of the label edge cases', async () => {
      const firstConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const withoutLabelConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: '',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 30, y: 30, height: 5, width: 5 },
      });
      const invalidConv = TestUtils.createConversationForTesting({
        conversationLabel: 'invalidConversation',
        conversationTopic: 'invalid',
        boundingBox: { x: 20, y: 20, height: 5, width: 5 },
      });
      const invalidConv2 = TestUtils.createConversationForTesting({
        conversationLabel: 'invalidConversation',
        conversationTopic: 'invalid',
        boundingBox: { x: 20, y: 20, height: 5, width: 5 },
      });
      const invalidConv3 = TestUtils.createConversationForTesting({
        conversationLabel: 'invalidConversation',
        conversationTopic: 'invalid',
        boundingBox: { x: 25, y: 25, height: 5, width: 5 },
      });

      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(0);
      const addfirst = testingTown.addConversationArea(firstConversationArea);
      expect(addfirst).toBe(true);
      expect(areas[0].label).toEqual(firstConversationArea.label);
      expect(areas[0].topic).toEqual(firstConversationArea.topic);
      expect(areas[0].boundingBox).toEqual(firstConversationArea.boundingBox);
      const addWithout = testingTown.addConversationArea(withoutLabelConversationArea);
      expect(addWithout).toBe(true);
      const addSecond = testingTown.addConversationArea(invalidConv);
      expect(addSecond).toBe(true);

      const addthird = testingTown.addConversationArea(invalidConv3);
      expect(addthird).toBe(false);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      expect(areas.length).toEqual(3);
      const addInvalidLabel = testingTown.addConversationArea(invalidConv2);
      expect(addInvalidLabel).toBe(false);
      expect(mockListener.onConversationAreaUpdated).not.toBeCalledWith(invalidConv2);
      const player = new Player('player');
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 20,
        y: 15,
        conversationLabel: invalidConv.label,
      };
      await testingTown.addPlayer(player);
      const addPlayer = testingTown.updatePlayerLocation(player, newLocation);
      expect(addPlayer).toBeUndefined();
      expect(player.activeConversationArea).toEqual(invalidConv);
      // Now, removing the player
      expect(invalidConv.occupantsByID.length).toBe(1);
      const removePlayer = testingTown.removePlayerFromConversationArea(player, invalidConv);
      expect(removePlayer).toBeUndefined();
      areas.splice(2);
      expect(areas.length).toEqual(2);
      // Now, we can add the conversation with the duplicate label
      expect(testingTown.addConversationArea(invalidConv2)).toBe(true);
      expect(areas.filter(element => element.label).length).toEqual(3);
      expect(areas.findIndex(p => p.label === invalidConv.label)).toEqual(2);
      expect(areas.find(conv => conv.label === invalidConv.label)).toEqual(invalidConv2);
      expect(areas.find(conv => conv.label === invalidConv.label)).toBeTruthy();
      areas.splice(2);
      expect(areas.find(conv => conv.label === invalidConv.label)).toBeUndefined();
      areas.splice(1);
      areas.splice(0);
      expect(areas.length).toEqual(0);
      expect(areas.find(conv => conv.label === invalidConv.label)).toBeUndefined();
      expect(areas.find(conv => conv.label === firstConversationArea.label)).toBeUndefined();
    });
    // Represents the checking of edge cases for the addConversationArea
    it('Represents the checking of edge cases for the addConversationArea', async () => {
      const firstConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const withoutLabelConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: '',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const invalidConv = TestUtils.createConversationForTesting({
        conversationLabel: 'invalidConversation',
        conversationTopic: 'invalid',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const invalidConv2 = TestUtils.createConversationForTesting({
        conversationLabel: 'invalidConversation',
        conversationTopic: 'invalid',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 20,
        y: 20,
        conversationLabel: invalidConv.label,
      };
      const areas = testingTown.conversationAreas;
      const player = new Player('player');
      await testingTown.addPlayer(player);

      const addThisConversation = testingTown.addConversationArea(firstConversationArea);
      const playerMove = testingTown.updatePlayerLocation(player, newLocation);
      expect(playerMove).toBeUndefined();
      expect(player.activeConversationArea).toBeUndefined();
      const addwithoutLabel = testingTown.addConversationArea(withoutLabelConversationArea);
      const addinvalid = testingTown.addConversationArea(invalidConv);
      expect(
        testingTown.addConversationArea({
          label: 'newConversationArea1 Label',
          topic: 'given new conv',
          occupantsByID: [],
          boundingBox: { x: 20, y: 20, height: 10, width: 5 },
        }),
      ).toBe(false);
      expect(
        testingTown.addConversationArea({
          label: 'new valid area',
          topic: 'new valid topic',
          occupantsByID: [],
          boundingBox: { x: 30, y: 30, height: 5, width: 5 },
        }),
      ).toBe(true);

      expect(addThisConversation).toBe(true);
      expect(addwithoutLabel).toBe(false);
      expect(addinvalid).toBe(true);
      expect(player.activeConversationArea).toEqual(invalidConv);

      // Represent the check to add the conversation label with the same label
      const sameLabelAdded = testingTown.addConversationArea(invalidConv2);
      expect(sameLabelAdded).toBe(false);
      expect(areas).not.toContain(invalidConv2);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      mockListeners.push(mockListener);
      testingTown.addTownListener(mockListener);

      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(0);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(0);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).not.toHaveBeenCalledWith(invalidConv);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerMoved).toHaveBeenCalledTimes(0);
      });
    });

    // Represents the adding of players and conversation areas that are invalid
    it('Represents the adding of players and conversation areas that are invalid ', async () => {
      const firstConversationArea = {
        label: 'newConversationArea1 Label',
        topic: 'newConversationArea1 Topic',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };
      const withoutLabelConversationArea = {
        label: '',
        topic: 'newConversationArea1 Topic',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };
      const secondConversationArea = {
        label: 'second',
        topic: 'second',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };
      const invalidConv = {
        label: 'invalidConversation',
        topic: 'invalid',
        occupantsByID: [],
        boundingBox: { x: 20, y: 20, height: 10, width: 5 },
      };
      const invalidConv2 = {
        label: 'invalidConversation',
        topic: 'invalid',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };
      const addThisConversation = testingTown.addConversationArea(firstConversationArea);
      const withoutLabel = testingTown.addConversationArea(withoutLabelConversationArea);
      const secondLabel = testingTown.addConversationArea(secondConversationArea);
      expect(addThisConversation).toBe(true);
      expect(withoutLabel).toBe(false);
      expect(secondLabel).toBe(false);

      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 30,
        y: 30,
        conversationLabel: firstConversationArea.label,
      };
      // Represents a player to be moved into an invalid conversation area
      const player = new Player('player to be added');
      testingTown.addPlayer(player);
      // Represents the invalid player
      const playerInvalid = new Player('');

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      mockListeners.push(mockListener);
      testingTown.addTownListener(mockListener);
      // Represents adding a player into the invalid conversation area and the emitter not being called
      testingTown.updatePlayerLocation(player, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledWith(firstConversationArea);
      testingTown.updatePlayerLocation(playerInvalid, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(2);

      // Represents an invalid conversation area
      const invalidConversation = {
        label: '',
        topic: '',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };
      const invalidity = testingTown.addConversationArea(invalidConversation);
      expect(invalidity).toBe(false);

      const invalidLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 30,
        y: 30,
        conversationLabel: invalidConv.label,
      };

      // Represents adding the player into an invalid location
      testingTown.updatePlayerLocation(player, invalidLocation);
      expect(mockListener.onConversationAreaUpdated).not.toBeCalledWith(invalidLocation);
      expect(mockListener.onConversationAreaUpdated).toBeCalledTimes(3);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).not.toHaveBeenCalledWith(
          invalidConversation,
        );
      });

      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(1);
      // Represents adding the conversation into the town
      const isItAdded = testingTown.addConversationArea(invalidConv);
      expect(isItAdded).toBe(true);
      expect(areas.length).toEqual(2);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledWith(invalidConv);

      // Represents adding the player into this conversation area
      expect(invalidConv.occupantsByID.length).toEqual(0);
      const addPlayerToThis = testingTown.updatePlayerLocation(player, invalidLocation);
      expect(addPlayerToThis).toBeUndefined();
      expect(invalidConv.occupantsByID.length).toBe(1);
      expect(mockListener.onConversationAreaUpdated).toBeCalledWith(invalidConv);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledWith(invalidConv);
      });
      expect(firstConversationArea.occupantsByID.length).toEqual(1);
      expect(testingTown.addConversationArea(invalidConv2)).toBe(false);
      expect(mockListener.onConversationAreaUpdated).not.toHaveBeenCalledWith(invalidConv2);
    });

    // Represents the case of checking for the number of conversation areas, whether they are valid and can be added
    it('Represents the case of checking for the number of conversation areas, whether they are valid and can be added  ', async () => {
      const firstConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const secondConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const thirdConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: '',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const noTopicConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'no topic label',
        conversationTopic: '',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const overlappingConvArea = TestUtils.createConversationForTesting({
        conversationLabel: 'Overlaps',
        conversationTopic: 'overlaps',
        boundingBox: { x: 25, y: 25, height: 15, width: 15 },
      });
      const conversationAreaToBeAdded = TestUtils.createConversationForTesting({
        conversationLabel: 'conversation',
        conversationTopic: 'conversationarea',
        boundingBox: { x: 30, y: 30, height: 10, width: 10 },
      });
      const result = testingTown.addConversationArea(secondConversationArea);
      expect(result).toBe(true);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      mockListeners.push(mockListener);
      testingTown.addTownListener(mockListener);
      // Represents an invalid conversation area
      const invalidArea = TestUtils.createConversationForTesting({
        conversationLabel: '',
        conversationTopic: '',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });

      const invalid = testingTown.addConversationArea({
        label: '',
        topic: '',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      expect(invalid).toBe(false);
      expect(invalidArea.topic).toBeTruthy();

      const player = new Player('player');
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 30,
        y: 30,
        conversationLabel: conversationAreaToBeAdded.label,
      };

      // Represents intitializing the players in order to check for the functionalities of the addConversationArea function
      const player1 = new Player('Player 1');
      const player2 = new Player('Player 2');
      const player3 = new Player('Player 3');
      const player4 = new Player('Player 4');
      const player5 = new Player('Player 5');

      // Represents the test to check if a conversation area with a same label is added into the testing town
      const checkLabelInvalid = testingTown.addConversationArea(thirdConversationArea);
      expect(checkLabelInvalid).toBe(false);

      // This cannot be added since the bounding boxes of this and the secondConversation areas are the same
      const checkValidLabel = testingTown.addConversationArea(firstConversationArea);
      expect(checkValidLabel).toBe(true);

      const checkResult = testingTown.addConversationArea(noTopicConversationArea);
      expect(checkResult).toBe(false);

      // Represents the attempt to add a conversation area when there is no topic, in the case of which, it should return false
      const overlappingBoundingBox = testingTown.addConversationArea(overlappingConvArea);
      expect(overlappingBoundingBox).toBe(false);

      // Represents the areas in the town
      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(2);
      const checkIfEnter = testingTown.addConversationArea(conversationAreaToBeAdded);
      testingTown.updatePlayerLocation(player, newLocation);
      testingTown.updatePlayerLocation(player1, newLocation);
      testingTown.updatePlayerLocation(player2, newLocation);
      testingTown.updatePlayerLocation(player3, newLocation);
      testingTown.updatePlayerLocation(player4, newLocation);
      testingTown.updatePlayerLocation(player5, newLocation);
      expect(checkIfEnter).toBe(true);
      expect(areas.length).toEqual(3);
      expect(player1.isWithin(conversationAreaToBeAdded)).toBe(true);
      expect(player2.isWithin(conversationAreaToBeAdded)).toBe(true);
      expect(player3.isWithin(conversationAreaToBeAdded)).toBe(true);
      expect(player4.isWithin(conversationAreaToBeAdded)).toBe(true);
      expect(player5.isWithin(conversationAreaToBeAdded)).toBe(true);
      // --------- X --------------
      expect(player1.activeConversationArea).toBe(conversationAreaToBeAdded);
      expect(player2.activeConversationArea).toBe(conversationAreaToBeAdded);
      expect(player3.activeConversationArea).toBe(conversationAreaToBeAdded);
      expect(player4.activeConversationArea).toBe(conversationAreaToBeAdded);
      expect(player5.activeConversationArea).toBe(conversationAreaToBeAdded);
      // ------ Checking the occupant id list ---------
      expect(conversationAreaToBeAdded.occupantsByID.length).toEqual(6);
      expect(conversationAreaToBeAdded.occupantsByID[0]).toEqual(player.id);
      expect(conversationAreaToBeAdded.occupantsByID[1]).toEqual(player1.id);
      expect(conversationAreaToBeAdded.occupantsByID[2]).toEqual(player2.id);
      expect(conversationAreaToBeAdded.occupantsByID[3]).toEqual(player3.id);
      expect(conversationAreaToBeAdded.occupantsByID[4]).toEqual(player4.id);
      expect(conversationAreaToBeAdded.occupantsByID[5]).toEqual(player5.id);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledWith(
          conversationAreaToBeAdded,
        );
      });

      expect(player.isWithin(conversationAreaToBeAdded)).toBe(true);
      expect(player.activeConversationArea).toEqual(conversationAreaToBeAdded);
      expect(player.activeConversationArea?.occupantsByID[0]).toEqual(
        conversationAreaToBeAdded.occupantsByID[0],
      );
    });

    // Represents the edge cases to be checked throughout the addConversation area function
    it('Represents the edge cases to be checked throughout the addConversation area function', async () => {
      // Represents creating an invalid conversation area to be added to the testing town
      const firstConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'givenfirsttopic',
        conversationTopic: 'conversations are good',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      // Represents a conversation area which when added, will have the bounding boxes overlap, in the case of which, the conversation
      // area will not be added to the testing town
      const overlappingConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 40, y: 40, height: 100, width: 100 },
      });
      const secondConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'secondLabel',
        conversationTopic: 'Topic',
        boundingBox: { x: 50, y: 50, height: 20, width: 30 },
      });
      // Represents an invalid conversation area which cannot be added

      // Represents an undefined conversationarea
      const undefinedArea = TestUtils.createConversationForTesting({});
      const invalidAddArea = TestUtils.createConversationForTesting({
        conversationLabel: 'This is an invalid area',
        conversationTopic: '',
        boundingBox: { x: 50, y: 50, height: 20, width: 30 },
      });

      // Represents adding an invalid area into a town
      const invalidResult = testingTown.addConversationArea(invalidAddArea);
      expect(invalidResult).toBe(true); // -------CHECK THIS LINE

      const result = testingTown.addConversationArea(firstConversationArea);
      expect(result).toBe(true);
      // Represents the case of when an overlapping conversation area is added
      const overlapResult = testingTown.addConversationArea(overlappingConversationArea);
      expect(overlapResult).toBe(false);
      // Represents the case of adding a valid conversation area in the testing town in the case of which it will be returning true
      const validResult = testingTown.addConversationArea(secondConversationArea);
      expect(validResult).toBe(false);
      // Check for the undefined case

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      mockListeners.push(mockListener);
      testingTown.addTownListener(mockListener);
      const player = new Player(nanoid());
      await testingTown.addPlayer(player);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: firstConversationArea.label,
      };
      const undefinedLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: undefinedArea.label,
      };
      testingTown.updatePlayerLocation(player, newLocation);

      // Represents the player having the new conversation area added as the active conversation area
      expect(player.activeConversationArea).toEqual(firstConversationArea);
      expect(player.activeConversationArea?.occupantsByID[0]).toEqual(
        firstConversationArea.occupantsByID[0],
      );
      expect(player.activeConversationArea?.topic).toEqual(firstConversationArea.topic);
      expect(player.activeConversationArea?.label).toEqual(firstConversationArea.label);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledWith(firstConversationArea);
      });

      const areas = testingTown.conversationAreas;

      // Represents when an undefined conversation are is given in the case of which the player wont be moved and it should return false
      const moveInvalid = testingTown.addConversationArea(undefinedArea);
      expect(moveInvalid).toBe(true);
      testingTown.updatePlayerLocation(player, undefinedLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledWith(undefinedArea);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(3);

      expect(areas.length).toEqual(2);
      expect(areas).toContain(undefinedArea);
      expect(areas).toContain(invalidAddArea);
      expect(
        testingTown.addConversationArea({
          label: '',
          topic: '',
          occupantsByID: [],
          boundingBox: { x: 50, y: 50, height: 20, width: 30 },
        }),
      ).toBeFalsy();
    });
  });

  describe('updatePlayerLocation', () => {
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `updatePlayerLocation test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it("should respect the conversation area reported by the player userLocation.conversationLabel, and not override it based on the player's x,y location", async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const player = new Player(nanoid());
      await testingTown.addPlayer(player);

      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(player.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);

      const areas = testingTown.conversationAreas;
      expect(areas[0].occupantsByID.length).toBe(1);
      expect(areas[0].occupantsByID[0]).toBe(player.id);
    });
    it('should check for the index mutation of the player when the player has been removed from the given index', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const player1 = new Player('player 1');
      const player2 = new Player('player 1');
      const player3 = new Player('player 1');
      await testingTown.addPlayer(player1);
      await testingTown.addPlayer(player2);
      await testingTown.addPlayer(player3);

      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      testingTown.updatePlayerLocation(player1, newLocation);
      testingTown.updatePlayerLocation(player2, newLocation);
      testingTown.updatePlayerLocation(player3, newLocation);
      expect(player1.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player1.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player1.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);
      expect(player2.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player2.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player2.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);
      expect(player3.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player3.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player3.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);

      const areas = testingTown.conversationAreas;
      expect(areas[0].occupantsByID.length).toBe(3);
      expect(areas[0].occupantsByID[0]).toBe(player1.id);
      expect(areas[0].occupantsByID[1]).toBe(player2.id);
      expect(areas[0].occupantsByID[2]).toBe(player3.id);
      // Represents removing player 2 from the conversation area
      testingTown.removePlayerFromConversationArea(player2, newConversationArea);
      expect(newConversationArea.occupantsByID).toContain(player1.id);
      expect(newConversationArea.occupantsByID).toContain(player3.id);
    });
    it('should emit an onConversationUpdated event when a conversation area gets a new occupant', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);

      const mockListener = mock<CoveyTownListener>();
      testingTown.addTownListener(mockListener);

      const player = new Player(nanoid());
      await testingTown.addPlayer(player);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
    });

    // Represents the case of checking the entire remove helper function(additional tests)
    it('Represents the case of checking the entire remove helper function(additional tests)', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const prevConversationArea1 = {
        label: 'label',
        topic: 'topic',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };
      const prevConversationArea2 = {
        label: 'label1',
        topic: 'topic1',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };

      const result = testingTown.addConversationArea(newConversationArea);

      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea1);
      const resultPreviousLocation1 = testingTown.addConversationArea(prevConversationArea2);

      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);
      expect(resultPreviousLocation1).toBe(false);

      const player = new Player('Player 1');
      const playerCheckEdgeCase = new Player('player');
      const playerCheckEdgeCase2 = new Player('player1');

      await testingTown.addPlayer(player);
      await testingTown.addPlayer(playerCheckEdgeCase);
      await testingTown.addPlayer(playerCheckEdgeCase2);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      mockListeners.push(mockListener);
      testingTown.addTownListener(mockListener);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);
      expect(resultPreviousLocation1).toBe(false);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 30,
        y: 30,
        conversationLabel: newConversationArea.label,
      };

      // Represents adding two players into a conversation area
      const add1 = testingTown.updatePlayerLocation(player, newLocation);
      const addSecond = testingTown.updatePlayerLocation(playerCheckEdgeCase, newLocation);
      expect(add1).toBeUndefined();
      expect(addSecond).toBeUndefined();
      expect(player.activeConversationArea).toEqual(newConversationArea);
      expect(playerCheckEdgeCase.activeConversationArea).toEqual(newConversationArea);
      expect(player.activeConversationArea?.occupantsByID.length).toEqual(
        newConversationArea.occupantsByID.length,
      );
      expect(playerCheckEdgeCase.activeConversationArea?.occupantsByID.length).toEqual(
        newConversationArea.occupantsByID.length,
      );
      expect(player.id).toEqual(newConversationArea.occupantsByID[0]);
      expect(playerCheckEdgeCase.id).toEqual(newConversationArea.occupantsByID[1]);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(2);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledWith(newConversationArea);
      // Represents removing the second added player from the conversation area now
      const removeCheckEdgePlayer = testingTown.removePlayerFromConversationArea(
        playerCheckEdgeCase,
        newConversationArea,
      );
      expect(removeCheckEdgePlayer).toBeUndefined();
      // Now, check for the presence in the occupants id list in the conversation area
      expect(playerCheckEdgeCase.id).not.toEqual(newConversationArea.occupantsByID[1]);
      expect(newConversationArea.occupantsByID).not.toContain(playerCheckEdgeCase.id);
      expect(newConversationArea.occupantsByID).toContain(player.id);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledTimes(3);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaDestroyed).not.toHaveBeenCalledWith(
          newConversationArea,
        );
      });
      // One player removed - length decreased to 1
      expect(newConversationArea.occupantsByID.length).toEqual(1);
      const playerRemoved = testingTown.removePlayerFromConversationArea(
        player,
        newConversationArea,
      );
      expect(playerRemoved).toBeUndefined();
      // Now, check for the presence in the occupants id list in the conversation area
      expect(player.id).not.toEqual(newConversationArea.occupantsByID[0]);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledTimes(3);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaDestroyed).toHaveBeenCalledTimes(1);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaDestroyed).toHaveBeenCalledWith(newConversationArea);
      });
      // Another player removed - length decreased to 0
      expect(newConversationArea.occupantsByID.length).toEqual(0);
      // Now, we will try to remove a player from a conversation area that does not have any players
      const removeLastPlayer = testingTown.removePlayerFromConversationArea(
        playerCheckEdgeCase2,
        newConversationArea,
      );
      expect(removeLastPlayer).toBeUndefined();
      expect(newConversationArea.occupantsByID.findIndex(p => p === playerCheckEdgeCase2.id)).toBe(
        -1,
      );
    });

    // Represents the case of checking the edge case of when a player can be removed
    it('Represents the case of checking the edge case of when a player can be removed', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 30, y: 30, height: 20, width: 20 },
      });
      const prevConversationArea = {
        label: 'label',
        topic: 'topic',
        occupantsByID: [],
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      };
      const result = testingTown.addConversationArea(newConversationArea);
      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);

      const player = new Player('Player 1');
      const playerCheckEdgeCase = new Player('player');

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      mockListeners.push(mockListener);
      testingTown.addTownListener(mockListener);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 30,
        y: 30,
        conversationLabel: newConversationArea.label,
      };
      // Represents removing a player from a conversation area with an empty occupant ID list
      const removeAttempt = testingTown.removePlayerFromConversationArea(
        player,
        prevConversationArea,
      );
      expect(removeAttempt).toBeFalsy();
      expect(mockListener.onConversationAreaUpdated(prevConversationArea)).toBeUndefined();
      expect(mockListener.onConversationAreaDestroyed(prevConversationArea)).toBeUndefined();
      expect(mockListener.onPlayerMoved).not.toHaveBeenCalledWith(player);
      // Represents adding the player into the new conversation area
      const addAttempt = testingTown.updatePlayerLocation(playerCheckEdgeCase, newLocation);
      expect(addAttempt).toBeUndefined();
      expect(playerCheckEdgeCase.activeConversationArea).toEqual(newConversationArea);
      expect(newConversationArea.occupantsByID[0]).toEqual(playerCheckEdgeCase.id);
      // Now, we will remove this player
      const removeAttemptFromValidArea = testingTown.removePlayerFromConversationArea(
        playerCheckEdgeCase,
        newConversationArea,
      );
      expect(removeAttemptFromValidArea).toBeUndefined();
      expect(newConversationArea.occupantsByID[0]).not.toEqual(playerCheckEdgeCase.id);
      expect(
        newConversationArea.occupantsByID.splice(
          newConversationArea.occupantsByID.findIndex(p => p === player.id),
          1,
        ),
      ).toEqual([]);
      const playerAdded = testingTown.updatePlayerLocation(player, newLocation);
      expect(playerAdded).toBeUndefined();
      // expect(player.activeConversationArea).toEqual(newConversationArea);
    });
    // Represents the case of checking the first part of the code when we are checking for the conversation area validity
    it('Represents the case of checking the first part of the code when we are checking for the conversation area validity', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const prevConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);

      const player = new Player('Player 1');

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      testingTown.addTownListener(mockListener);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      // Represents another location instance created
      const newSecondLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: prevConversationArea.label,
      };
      // Represents invalid location instance created
      const invalidLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: '',
      };
      testingTown.updatePlayerLocation(player, invalidLocation);
      // Represents the conversation areas returned
      const areas = testingTown.conversationAreas;
      expect(areas.find(conv => conv.label === newLocation.conversationLabel)).toBe(
        newConversationArea,
      );
      expect(areas.find(conv => conv.label === newSecondLocation.conversationLabel)).toBe(
        prevConversationArea,
      );
      expect(areas.find(conv => conv.label === invalidLocation.conversationLabel)).toBeUndefined();

      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledTimes(0);
      });
    });

    // Represents the case of checking conversation area being updated if the player stays in it
    it('Represents the case of checking conversation area being updated if the player stays in it', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const prevConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);

      const player = new Player('Player 1');
      const invalidPlayer = new Player('player 2');
      invalidPlayer.location = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: 'abcdef',
      };

      await testingTown.addPlayer(player);
      await testingTown.addPlayer(invalidPlayer);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });

      testingTown.addTownListener(mockListener);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };

      const myPlayerSession = new PlayerSession(player);

      // Represents the string representing the valid session token of the player
      const playerToken = myPlayerSession.sessionToken;

      expect(playerToken).toBeDefined();
      testingTown.updatePlayerLocation(player, newLocation);
      expect(player.activeConversationArea).toEqual(newConversationArea);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledWith(newConversationArea);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
      // Represents adding the invalid player into the conversation area in the case of which the onConversationUpdated will not be called
      testingTown.updatePlayerLocation(invalidPlayer, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledWith(newConversationArea);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(2);
    });

    // Represents the case of checking the player and the location states and making sure that they are valid
    it('Represents the case of checking the player and the location states and making sure that they are valid', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const prevConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);

      const player = new Player('Player 1');
      await testingTown.addPlayer(player);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      testingTown.addTownListener(mockListener);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 10,
        y: 10,
        conversationLabel: newConversationArea.label,
      };

      expect(mockListener.onPlayerJoined).toHaveBeenCalledTimes(0);
      // Represents invalid location instance created
      const invalidLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: '',
      };
      // Represents player's states area before the location is updated
      expect(player.activeConversationArea?.boundingBox).toBeUndefined();
      expect(player.activeConversationArea?.label).toBeUndefined();
      expect(player.activeConversationArea?.topic).toBeUndefined();
      expect(player.activeConversationArea?.occupantsByID).toBeUndefined();
      expect(player.id).toBeDefined();
      expect(player.isWithin(newConversationArea)).toBeFalsy();
      expect(player.userName).toEqual('Player 1');
      expect(player.location).toBeDefined();
      // Represents updating the player state location
      testingTown.updatePlayerLocation(player, newLocation);
      expect(player.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);
      expect(player.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player.activeConversationArea?.occupantsByID).toEqual(
        newConversationArea.occupantsByID,
      );
      expect(player.id).toBeDefined();
      expect(player.isWithin(newConversationArea)).toBeTruthy();
      expect(player.userName).toEqual('Player 1');
      expect(player.location).toEqual(newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(1);
      expect(mockListener.onPlayerJoined).toHaveBeenCalledTimes(0);
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
      // Represents updating the player state location
      testingTown.updatePlayerLocation(player, invalidLocation);
      expect(player.activeConversationArea?.boundingBox).toBeUndefined();
      expect(player.activeConversationArea?.label).toBeUndefined();
      expect(player.activeConversationArea?.topic).toBeUndefined();
      expect(player.activeConversationArea?.occupantsByID).toBeUndefined();
      expect(player.id).toBeDefined();
      expect(player.isWithin(newConversationArea)).toBeFalsy();
      expect(player.userName).toEqual('Player 1');
      expect(player.location).toEqual(invalidLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(2);
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(1);

      // Represents the tests for the location state
      expect(newLocation.conversationLabel).toEqual(newConversationArea.label);
      expect(newLocation.moving).toBeFalsy();
      expect(newLocation.rotation).toEqual('front');
      expect(newLocation.x).toBeDefined();
      expect(newLocation.y).toBeDefined();
    });

    // Represents the case of now checking when the player has been updated by location, if the removal and adding is valid to previous and new conversation areas respectively
    it('Represents the case of now checking when the player has been updated by location, if the removal and adding is valid to previous and new conversation areas respectively', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const prevConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);

      const player = new Player('Player 1');
      const secondPlayer = new Player('Player2');
      await testingTown.addPlayer(player);
      await testingTown.addPlayer(secondPlayer);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      testingTown.addTownListener(mockListener);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 10,
        y: 10,
        conversationLabel: newConversationArea.label,
      };
      expect(mockListener.onPlayerJoined).toHaveBeenCalledTimes(0);
      // Represents another location instance created
      const newSecondLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: prevConversationArea.label,
      };

      const areas = testingTown.conversationAreas;

      expect(player.activeConversationArea).toBeUndefined();
      expect(player.location.conversationLabel).toBeUndefined();
      expect(player.activeConversationArea?.occupantsByID.length).toBeUndefined();
      // Represents updating the location of the player
      testingTown.updatePlayerLocation(player, newLocation);
      expect(player.activeConversationArea).toEqual(newConversationArea);
      expect(player.location.conversationLabel).toEqual(newConversationArea.label);
      expect(player.activeConversationArea?.occupantsByID.length).toEqual(1);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(1);
      expect(mockListener.onPlayerJoined).toHaveBeenCalledTimes(0);

      // Represents moving this player from one conversation area to another conversation area
      expect(areas.length).toEqual(2);
      expect(areas[0]).toEqual(newConversationArea);
      expect(areas[1]).toEqual(prevConversationArea);
      expect(prevConversationArea.occupantsByID.length).toEqual(0);
      expect(prevConversationArea).not.toEqual(newConversationArea);
      expect(prevConversationArea).toBeDefined();

      testingTown.updatePlayerLocation(player, newSecondLocation);
      // Checking if onConversationAreaDestroy is called
      expect(newConversationArea.occupantsByID.length).toBe(0);
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(1);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaDestroyed).toHaveBeenCalledWith(newConversationArea);
      });
      expect(areas.length).toEqual(1);
      expect(areas[0]).toEqual(prevConversationArea);
      expect(areas[1]).toBeUndefined();
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(2);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(2);
      expect(prevConversationArea.occupantsByID.length).toEqual(1);
      expect(player.activeConversationArea).toEqual(prevConversationArea);
      expect(player.activeConversationArea?.label).toEqual(prevConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(prevConversationArea.topic);
      expect(player.activeConversationArea?.boundingBox).toEqual(prevConversationArea.boundingBox);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledWith(prevConversationArea);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerMoved).toHaveBeenCalledWith(player);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerJoined).not.toHaveBeenCalledWith(player);
      });

      // Represents the test of adding having two players in a conversation area and when one is removed, just
      // call onConversationAreaUpdated and not onConversationAreaDestroyed
      testingTown.updatePlayerLocation(secondPlayer, newSecondLocation);
      expect(prevConversationArea.occupantsByID.length).toEqual(2);
      expect(prevConversationArea.label).toEqual(secondPlayer.activeConversationArea?.label);
      expect(prevConversationArea.topic).toEqual(secondPlayer.activeConversationArea?.topic);
      expect(prevConversationArea.boundingBox).toEqual(
        secondPlayer.activeConversationArea?.boundingBox,
      );
      // Represents moving the player back to newConversationArea
      testingTown.updatePlayerLocation(player, newLocation);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerMoved).toHaveBeenCalledWith(secondPlayer);
      });
      expect(prevConversationArea.occupantsByID.length).toEqual(1);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(4);
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledWith(prevConversationArea);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerMoved).toHaveBeenCalledWith(player);
      });
      expect(player.location).toEqual(newLocation);
      // Represents the case that since the newConversationArea is destroyed, its active conversation area will be undefined
      expect(player.activeConversationArea).toBeUndefined();
    });

    // Represents the case of checking whether the town listener is called when it is destroyed or added
    it('Represents the case of checking whether the town listener is called when it is destroyed or added', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const prevConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);

      const player = new Player('Player 1');
      const playerCheckEdgeCase = new Player('player');

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      // mockListeners.push(mockListener);
      testingTown.addTownListener(mockListener);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      // Represents another location instance created
      const newSecondLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: prevConversationArea.label,
      };
      // Represents invalid location instance created
      const invalidLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: '',
      };

      // Represents invalid location instance created
      const invalidConversationLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: 'abc',
      };
      // Represents the case of when a player moves from an conversation area into an invalid conversation area
      testingTown.updatePlayerLocation(playerCheckEdgeCase, newLocation);
      expect(playerCheckEdgeCase.activeConversationArea).toEqual(newConversationArea);
      expect(playerCheckEdgeCase.activeConversationArea?.occupantsByID.length).toEqual(
        newConversationArea.occupantsByID.length,
      );
      testingTown.updatePlayerLocation(playerCheckEdgeCase, invalidConversationLocation);
      expect(playerCheckEdgeCase.activeConversationArea).toBeUndefined();
      expect(playerCheckEdgeCase.activeConversationArea?.occupantsByID.length).toBeUndefined();
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledWith(newConversationArea);

      testingTown.updatePlayerLocation(player, invalidLocation);
      // Represents the onPlayer being moved
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(3);
      // Represents removing a town listener and then updating the player again, in the case of which it should not have been called
      testingTown.removeTownListener(mockListener);
      testingTown.updatePlayerLocation(player, newLocation);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(3);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
      // Represents adding the listener again
      testingTown.addTownListener(mockListener);
      testingTown.updatePlayerLocation(player, newSecondLocation);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(4);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(2);
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(1);
      testingTown.removePlayerFromConversationArea(player, prevConversationArea);
      expect(mockListener.onPlayerDisconnected).toHaveBeenCalledTimes(0);
      expect(mockListener.onTownDestroyed).toHaveBeenCalledTimes(0);
    });

    // Represents the case of when the player being removed from its active existing conversation area is checked when its location is updated since it moves to a new conversation area or out of the exisitng previous active conversation area
    it('Should remove the player from its existing or active conversation area when the location is updated since the player moves into a new conversation area', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'newConversationArea1 Label',
        conversationTopic: 'newConversationArea1 Topic',
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const prevConversationArea = TestUtils.createConversationForTesting({
        conversationLabel: 'prev Label',
        conversationTopic: 'prev Topic',
        boundingBox: { x: 20, y: 20, height: 10, width: 10 },
      });

      const result = testingTown.addConversationArea(newConversationArea);
      // Represents adding the previous active location from the conversation area of the player to the testing town to be tested
      const resultPreviousLocation = testingTown.addConversationArea(prevConversationArea);
      expect(result).toBe(true);
      expect(resultPreviousLocation).toBe(true);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });
      testingTown.addTownListener(mockListener);

      const player = new Player('Player1');

      const secondPlayer = new Player('Player2');

      const thirdPlayer = new Player('Player3');

      // player.activeConversationArea = prevConversationArea;
      // Represents adding the player into the prevConversationArea to check for the updatePlayerLocation function
      await testingTown.addPlayer(player);
      await testingTown.addPlayer(secondPlayer);
      await testingTown.addPlayer(thirdPlayer);
      // Represents the case of when a player joins a town
      expect(mockListener.onPlayerJoined).toHaveBeenCalledTimes(3);

      // Represents the cases to check whether the conversation areas and the players are valid
      expect(typeof player.id).toBe('string');
      expect(typeof secondPlayer.id).toBe('string');
      expect(typeof thirdPlayer.id).toBe('string');
      expect(typeof newConversationArea.topic && typeof newConversationArea.label).toBe('string');
      expect(typeof prevConversationArea.topic && typeof prevConversationArea.label).toBe('string');

      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };

      // Represents another location instance created
      const newSecondLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: prevConversationArea.label,
      };

      // Represents testing when a player is moved into a conversation area from not a previous conversation area
      testingTown.updatePlayerLocation(thirdPlayer, newSecondLocation);
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);

      // Represents that the label, topic, bounding box, will be undefined before the player is updated into the location of the
      // conversation area
      expect(player.activeConversationArea?.label).toBeUndefined();
      expect(player.activeConversationArea?.topic).toBeUndefined();
      expect(player.activeConversationArea?.boundingBox).toBeUndefined();
      // Represents no players that have been added
      expect(newConversationArea.occupantsByID.length).toBe(0);
      // Represents the testing of bounding boxes
      expect(player.location.x).not.toEqual(newLocation.y);
      expect(player.location.y).not.toEqual(newLocation.y);
      // Now we know that the player is to be moved into a conversation area
      testingTown.updatePlayerLocation(player, newLocation);

      // Represents the testing of bounding boxes
      expect(player.location.x).toEqual(newLocation.x);
      expect(player.location.y).toEqual(newLocation.y);
      // Represents a player that has been added by updating its location
      expect(newConversationArea.occupantsByID.length).toEqual(1);

      // Represents the test when a player is tried to be updated in the same conversation area in the case of which,
      // the listener will not be updated
      testingTown.updatePlayerLocation(player, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(2);
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(3);
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0); //

      // Represents the player being moved
      expect(player.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);

      // Represents no players that are present in the prevConversationArea
      expect(prevConversationArea.occupantsByID.length).toEqual(1);
      // Represents that the label, topic, bounding box, will be undefined before the secondPlayer is updated into the location of the
      // conversation area
      expect(secondPlayer.activeConversationArea?.label).toBeUndefined();
      expect(secondPlayer.activeConversationArea?.topic).toBeUndefined();
      expect(secondPlayer.activeConversationArea?.boundingBox).toBeUndefined();

      // Represents the testing of bounding boxes
      expect(secondPlayer.location.x).not.toEqual(newSecondLocation.x);
      expect(secondPlayer.location.y).not.toEqual(newSecondLocation.y);

      // Now we know that the player is to be moved into a conversation area
      testingTown.updatePlayerLocation(secondPlayer, newSecondLocation);

      // Represents the testing of bounding boxes
      expect(secondPlayer.location.x).toEqual(newSecondLocation.y);
      expect(secondPlayer.location.y).toEqual(newSecondLocation.y);

      // Represents a player that has been added by updating its location
      expect(prevConversationArea.occupantsByID.length).toEqual(2);
      // Represents the secondPlayer being moved
      expect(secondPlayer.activeConversationArea?.label).toEqual(prevConversationArea.label);
      expect(secondPlayer.activeConversationArea?.topic).toEqual(prevConversationArea.topic);
      expect(secondPlayer.activeConversationArea?.boundingBox).toEqual(
        prevConversationArea.boundingBox,
      );
      // Represents the onPlsayerDisconnected test case that in the case of which the the number of times it is called should be 1
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(4);
      // Represents the test of when the listeners are called every time a player is moved
      mockListeners.forEach(element => {
        expect(element.onPlayerMoved).toHaveBeenCalledWith(player);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerMoved).toHaveBeenCalledWith(secondPlayer);
      });

      // Represents checking if the conversation areas are different, so that the location can be updated
      expect(secondPlayer.activeConversationArea).not.toBe(newConversationArea);
      // Now that the second player is in the prevConversation area, we can update and make it to move into the
      // new conversation area and remove it from the prevConverationArea
      testingTown.updatePlayerLocation(secondPlayer, newLocation);
      // To check whether the second player has been moved or not
      mockListeners.forEach(givenElement => {
        expect(givenElement.onPlayerMoved).toHaveBeenCalledWith(secondPlayer);
      });
      expect(mockListener.onPlayerMoved).toHaveBeenCalledTimes(5);

      // Represents showing the test of when the previous conversation has the player removed
      expect(prevConversationArea.occupantsByID.length).toEqual(1);
      // Represents the test when an onconversationarea updated and destroyed are called when the secondPlayer has the location updated
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaUpdated).toHaveBeenCalledWith(newConversationArea);
      });
      mockListeners.forEach(givenElement => {
        expect(givenElement.onConversationAreaDestroyed).not.toHaveBeenCalledWith(
          prevConversationArea,
        );
      });
      // Represents the onConversationAreaDestroyed being called once since the prevConversation area is to be destroyed
      expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
      // Represents the onConversationAreaUpdated being called 3 times
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(5);
      // Represents the test to check whether the secondPlayer has moved to the newConversationArea succesfully
      expect(newConversationArea.occupantsByID.length).toEqual(2); // Since it has two players now
      expect(newConversationArea.occupantsByID[0]).toEqual(player.id);
      expect(newConversationArea.occupantsByID[1]).toEqual(secondPlayer.id);
    });
  });

  // Represents testing the CoveyTownController.destroySession function that states that when a player is destroyed, they should be removed from
  // the coversation area
  describe('destroySession', () => {
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `destroySession test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it('Tests for when a players session is destroyed, they should be removed from the conversation area', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      // Represents the first player in the conversation area
      const playerAtInstance = new Player(nanoid());
      // Represents the second player in the conversation area
      const secondPlayerAtInstance = new Player(nanoid());
      // Represents the session of the given PlayerAtInstance
      const playerSession = new PlayerSession(playerAtInstance);
      // Represents adding the first and the second players in the conversation area in the testing town
      await testingTown.addPlayer(playerAtInstance);
      await testingTown.addPlayer(secondPlayerAtInstance);

      // Represents updating the location of the playerAtInstance in the newLocation for both of the players to be in the saem location to test
      // the detroySession
      testingTown.updatePlayerLocation(playerAtInstance, newLocation);
      // Represents updating the location of the secondPlayerAtInstance for it to be in the newLocation along with the playerAtInstance
      testingTown.updatePlayerLocation(secondPlayerAtInstance, newLocation);

      // Represents the test that represents both the players present in the testing down before destroying one of the sessions
      expect(testingTown.players.length).toBe(2);

      // Represents the test that represents that the occupant ID list size is 2 before a player session is destroyed
      const areas = testingTown.conversationAreas;

      // Represents the test case of when there are two occupant IDs in the areas before one player is destroyed
      expect(testingTown.players.length).toBe(2);

      expect(areas[0].occupantsByID.length).toBe(2);

      // Represents destroying the player session in the case of which, the player will have to be removed from the given conversation
      // area is its session is destroyed
      testingTown.destroySession(playerSession);
      // Represents the player being removed from the conversation area after the player session is destroyed
      expect(testingTown.players.length).toBe(1);

      // Represents the test case of when there is just one occupantByID left in the areas because the other playerAtInstance's session has been destroyed
      expect(areas.filter(element => element.occupantsByID).length).toBe(1);
      // Represents the area to have one occupant ID removed after destroying a player's session
      expect(areas[0].occupantsByID.length).toBe(1);
    });
    it('should emit an onPlayerDisconnected event when a player is disconnected/destroyed or removed from its given conversation area', async () => {
      // Represents creating a new conversation area for testing purposes
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      // Represents adding a newConversationArea to test for the destroySession method
      const result = testingTown.addConversationArea(newConversationArea);
      // Represents the test base case of when a conversation area exists, return true
      expect(result).toBe(true);

      const mockListener = mock<CoveyTownListener>();
      // Represents the array of mock listeners
      const mockListeners = [mock<CoveyTownListener>()];
      mockListeners.forEach(element => {
        testingTown.addTownListener(element);
      });

      // Represents adding the MockListener to the testingTown
      testingTown.addTownListener(mockListener);

      const playerAtInstance = new Player(nanoid());
      // Represents the session of the given PlayerAtInstance
      const playerSession = new PlayerSession(playerAtInstance);
      await testingTown.addPlayer(playerAtInstance);

      // Represents case of when the player session has been destroyed
      testingTown.destroySession(playerSession);
      // Represents the onPlayerDisconnected test case that in the case of which the the number of times it is called should be 1
      expect(mockListener.onPlayerDisconnected).toHaveBeenCalledTimes(1);
      // Represents the test of when the listeners are called every time a player is destroyed
      mockListeners.forEach(element => {
        expect(element.onPlayerDisconnected).toHaveBeenCalledWith(playerAtInstance);
      });
    });
  });
});
