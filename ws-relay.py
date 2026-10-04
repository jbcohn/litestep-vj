#!/usr/bin/env python3
"""
LiteStep VJ - WebSocket Relay Server
Enables direct local LAN communication between smartphone (remote.html) and MacBook (index.html).
Works completely offline without internet access.
"""

import asyncio
import json
import socket
import sys

try:
    import websockets
except ImportError:
    print("Error: 'websockets' library is required. Install via: pip install websockets")
    sys.exit(1)

PORT = 8001
HOST = "0.0.0.0"

# Connected WebSocket clients
CLIENTS = set()

# Latest cached system state for instant phone sync upon connection
LATEST_STATE = {
    "type": "state",
    "sceneIdx": 4,
    "sceneName": "Dancer",
    "danceClip": "house_basic_bounce",
    "danceTitle": "House Basic Bounce",
    "blackout": False,
    "sceneLock": False,
    "bpm": 126,
    "sensitivity": 1.0,
    "formation": "1",
    "speed": 1.0,
    "mirrored": False
}

def get_lan_ip():
    """Detect primary local IPv4 address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
    except Exception:
        try:
            s.connect(("192.168.1.1", 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = "127.0.0.1"
    finally:
        s.close()
    return ip

async def relay_handler(websocket):
    CLIENTS.add(websocket)
    client_ip = websocket.remote_address[0] if websocket.remote_address else "unknown"
    print(f"[WS Relay] Client connected from {client_ip} (Total clients: {len(CLIENTS)})")

    # Send current state to newly connected client
    try:
        await websocket.send(json.dumps(LATEST_STATE))
    except Exception:
        pass

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                # If message is a state update from visualizer, cache it
                if data.get("type") == "state_update":
                    for k, v in data.items():
                        if k != "type":
                            LATEST_STATE[k] = v
                # Relay to all other clients
                if CLIENTS:
                    tasks = []
                    for client in list(CLIENTS):
                        if client != websocket:
                            tasks.append(client.send(message))
                    if tasks:
                        results = await asyncio.gather(*tasks, return_exceptions=True)
                        for client, res in zip(list(CLIENTS), results):
                            if isinstance(res, Exception):
                                CLIENTS.discard(client)
            except json.JSONDecodeError:
                pass
            except Exception as e:
                print(f"[WS Relay] Message broadcast error: {e}")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CLIENTS.discard(websocket)
        print(f"[WS Relay] Client disconnected (Total clients: {len(CLIENTS)})")

async def main():
    lan_ip = get_lan_ip()
    print("=" * 64)
    print("  LiteStep VJ - Remote Control WebSocket Relay")
    print(f"  Status: Active & Listening on 0.0.0.0:{PORT}")
    print(f"  Local LAN Address:  http://{lan_ip}:8000/remote.html")
    print("  On your phone Chrome, open the URL above.")
    print("=" * 64)

    async with websockets.serve(relay_handler, HOST, PORT):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[WS Relay] Stopped.")
