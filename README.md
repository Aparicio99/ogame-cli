# ogame-cli

CLI program to interact with the [OGame](www.ogame.org) browser-based MMO game.

It is written in Javascript, using [CasperJS](http://casperjs.org/) as browser API, originally running atop PhantomJS, but now with [SlimerJS](https://slimerjs.org/) that runs a headless standard [Firefox](https://developer.mozilla.org/en-US/Firefox/Headless_mode) instance.

## Disclaimer

 1.  Since this tool only facilitates the execution of the same sequence of actions than one can do manually in the browser, it does not give by itself any advantage in the game, and I would not classified it as cheating, but it still **goes explicitly agains the terms and conditions of the game**, that prohibit any use of "tools that are designed to replace or augment the web interface".
 2. This tool uses a headless browser, and almost every interaction with the web pages is done by emulating the mouse clicks and key presses instead of only making the HTTP requests with the necessary data. This is done by purpose to emulate the normal human interaction with the game, and avoid detection.
 3. By side effect of the previous point, **any change on the game content or layout can and will probably break some functionality of this tool** until fixed. It also means that possible changes to the game internal API will probably not affect it.

## Features

 - Outputs JSON to integrate easily with other tools.
 - Some mission types implemented:
	 - Transfer
	 - Transport
	 - Recycle
	 - Eploration.
 - Recall fleet by ID.
 - Single commands to launch missions on every planet:
	 - To collect all the possible resources to a single planet.
	 - To launch recycle missions to their own debris field.
 - Commands to retrieve information:
	 - Fleet movements
	 - Research levels
	 - Unread messages
	 - Planets resources, mines and facilities levels
 - Saves screenshots of certain pages.
 - Saves and restores sessions cookies to avoid unnecessary logins.

This tool was develop solely in mind for a [Miner](http://ogame.wikia.com/wiki/Miner) type of playing, first to automate tasks that became boring after having lots of planets, and afterwards to integrate with a higher layer tool that serves as dashboard and mission scheduler (to be published).

## How to use

Create a `config.json` file with your server settings:
```
{
    "server": "sXXX-YY.ogame.gameforge.com",
    "username": "your username",
    "password": "your password"
}
```
Running without arguments shows the supported commands:
```
Usage: ogame-cli <cmd> [<args>]
Supported commands:
  - list
  - get <flights|research|messages|resources|planets|all>
  - collect_all <destination>
  - recycle_all
  - transfer <origin> <destination> <speed>
  - transport <origin> <destination> <speed>
  - recycle <origin> <destination> <speed>
  - explore <origin> <speed>
  - return <id of the flight>
  <origin> and <destination> is the name of the planet or moon (case-insensitive).
  <speed> must be one this values: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.
```

Running `./ogame-cli list` should list the current fleet movements:
```
$ ./ogame-cli list
{
  "version": 2,
  "logged_in": false,
  "success": true,
  "flights": [
    {
      "id": 12345678,
      "type": 4,
      "takeoff": "2017-02-21 14:23:28",
      "arrival": "2018-04-04 15:03:17",
      "origin": "Planet1",
      "destination": "Planet2",
      "return": false,
      "metal": 100000,
      "crystal": 100000,
      "deuterium": 100000
    }
  ],
  "total_unread_messages": 0
}
```

## Requirements

Minimum versions for running headless:
 - CasperJS 1.1
 - SlimerJS 1.0.0
 - Firefox 56

