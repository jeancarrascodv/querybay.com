# Container Service - WebSocket to Enigo Bridge

This service provides a WebSocket server that forwards messages to an Enigo service for keyboard and mouse automation.

## Features

- WebSocket server on port 3000
- JSON message protocol for Enigo commands
- Support for keyboard actions (press, release, click)
- Support for text input
- Mouse action support (limited - requires additional setup)
- Error handling and response feedback

## Usage

### Starting the Server

```bash
cargo run -p container-service
```

The server will start on `0.0.0.0:3000` and listen for WebSocket connections on the `/ws` endpoint.

### Message Protocol

Send JSON messages with the following structure:

#### Keyboard Actions

```json
{
  "type": "Key",
  "key": "enter",
  "action": "Click"
}
```

Supported keys: `enter`, `tab`, `space`, `backspace`, `delete`, `escape`, `up`, `down`, `left`, `right`, `ctrl`, `alt`, `shift`, `cmd`, `meta`, or any single character.

Supported actions: `Press`, `Release`, `Click`

#### Text Input

```json
{
  "type": "Text",
  "text": "Hello, World!"
}
```

#### Mouse Actions (Limited Support)

```json
{
  "type": "Mouse",
  "x": 100,
  "y": 200,
  "action": "Click"
}
```

### Example Client (JavaScript)

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = function () {
  console.log("Connected to WebSocket server");

  // Send a text message
  ws.send(
    JSON.stringify({
      type: "Text",
      text: "Hello from WebSocket!",
    })
  );

  // Send a key press
  ws.send(
    JSON.stringify({
      type: "Key",
      key: "enter",
      action: "Click",
    })
  );
};

ws.onmessage = function (event) {
  const response = JSON.parse(event.data);
  console.log("Server response:", response);
};
```

### Response Format

The server responds with either:

**Success:**

```json
{
  "status": "success"
}
```

**Error:**

```json
{
  "error": "Error message describing what went wrong"
}
```

## Security Note

This service provides direct access to keyboard and mouse automation. Use with caution and ensure proper access controls are in place in production environments.
