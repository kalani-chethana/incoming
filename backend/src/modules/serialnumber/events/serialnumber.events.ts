import { EventEmitter } from "node:events";

export const SERIAL_NUMBER_EVENTS = {
  SESSION_CREATED: "serialnumber:session_created",
  SERIAL_SCANNED: "serialnumber:serial_scanned",
  HEALTH_CHECKED: "serialnumber:health_checked",
} as const;

export class SerialNumberEventEmitter extends EventEmitter {}

export const serialnumberEvents = new SerialNumberEventEmitter();

serialnumberEvents.on(SERIAL_NUMBER_EVENTS.SESSION_CREATED, (data) => {
  console.log(`[Event] Session recorded: ID ${data?.session_id}`);
});

serialnumberEvents.on(SERIAL_NUMBER_EVENTS.SERIAL_SCANNED, (data) => {
  console.log(
    `[Event] Serial scanned: detected=${data?.detected}, confidence=${data?.confidence}`,
  );
});

export default serialnumberEvents;

