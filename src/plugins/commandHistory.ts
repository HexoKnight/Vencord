/* eslint-disable simple-header/header */
/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { addPreSendListener, removePreSendListener } from "@api/MessageEvents";
import { Devs } from "@utils/constants";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin from "@utils/types";
import { find } from "@webpack";
import { ComponentDispatch, MessageStore, SelectedChannelStore, UserStore } from "@webpack/common";

function getUserMessages() {
    const userId = UserStore.getCurrentUser().id;
    const channelId = SelectedChannelStore.getChannelId();
    var allMessages: Array<any> = MessageStore.getMessages(channelId).toArray();
    var messages = allMessages.reverse().filter(function (msg) {
        // NOTE: doesn't work for application commmands as discord seems to forget how to recreate them on reload :(
        return /* msg.interaction != null ? msg.interaction.user.id === userId : */ msg.author.id === userId;
    });
    console.log("user's messages currently loaded: " + messages.length);
    return messages;
}
var commandHistoryPositions: Map<string, number> = new Map();

export default definePlugin({ // TODO - add setting to reverse ctrl usage
    name: "Command History",
    description: "Changes up/down arrow functionality to cycle through previously sent messages like in a terminal instead of editing the previous message\nbear in mind this means you cannot use up and down arrows to move through multiline messages",
    authors: [Devs.Hexo],
    patches: [
        {
            find: ".handleEditLastMessage",
            replacement: { // intercept up arrow functionality and add down arrow functionality
                match: /(?<start>.handleKeyDown=function\((?<param>.+?)\).{1,200}(?<keyboardModeEnabled>.{1,2})=.+?\.keyboardModeEnabled.{1,100}(?<modifierKey>.{1,2})=.+?\..{3,5}Key.{1,100}(?<nonEmpty>.{1,2})=0!=.{1,200}case (?<keyType>.{1,10})\.ARROW_UP:.{0,100})if\(\k<modifierKey>\)return;(?<betweenreturns>.{0,100}?)if\(\k<nonEmpty>\)return;(?<afterreturns>.{1,100}?if\(\k<keyboardModeEnabled>\))(?<keyboardModeBlock>.{1,300}?)else{(?<originalBlock>.{1,600}?=(?<context>.{1,5}).getLastCommandMessage.{1,600}?)}return;case/,
                replace: "$<start>if($<param>.shiftKey||$<param>.altKey||$<param>.metaKey||($<param>.ctrlKey&&$<nonEmpty>))return;$<betweenreturns>$<afterreturns>{if($<param>.ctrlKey)return;$<keyboardModeBlock>}else{if($<param>.ctrlKey){$<param>.ctrlKey=false;$<originalBlock>}else{" +
                    "$self.press_up();" +
                    "}}return;case $<keyType>.ARROW_DOWN:if($<modifierKey>)return;" +
                    "$self.press_down();" +
                    "return;case"
            }
        }
    ],
    start() {
        this.listener = addPreSendListener(channelId => {
            commandHistoryPositions.delete(channelId); // reset position
        });
    },
    stop() {
        removePreSendListener(this.listener);
    },
    press_up: function () {
        const channelId = SelectedChannelStore.getChannelId();
        var messages = getUserMessages();

        var current = commandHistoryPositions.get(channelId);
        if (current === undefined)
            current = 0;
        else if (current === messages.length - 1)
            return; // cannot increase further, no need to clear the text
        else
            current = Math.min(current + 1, messages.length - 1);
        commandHistoryPositions.set(channelId, current);

        const NewComponentDispatch = find(m => m.emitter?._events?.CLEAR_TEXT);
        NewComponentDispatch.dispatchToLastSubscribed("CLEAR_TEXT");
        // ComponentDispatch.dispatchToLastSubscribed("CLEAR_TEXT");
        ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", {
            rawText: messages[current].content
        });
        // insertTextIntoChatInputBox(messages[current].content);
    },
    press_down: function () {
        const channelId = SelectedChannelStore.getChannelId();
        var messages = getUserMessages();

        var current = commandHistoryPositions.get(channelId);
        if (current === undefined || current === -1) return; // cannot decrease further, no need to clear the text
        current = Math.min(Math.max(current - 1, -1), messages.length - 1);
        commandHistoryPositions.set(channelId, current);

        ComponentDispatch.dispatchToLastSubscribed("CLEAR_TEXT");
        if (current >= 0)
            insertTextIntoChatInputBox(messages[current].content);
    },
});