var work_dir = './';
var screenshot_dir = work_dir + '/screenshots/';
var cookie_jar = work_dir + '/cookies.json';
var player_data = work_dir + '/playerData.xml';
var config_file = work_dir + '/config.json';

var place = {
  PLANET:  1,
  DEBRIS:  2,
  MOON:    3,
  EXP :    4,
};

var mission = {
  TRANSPORT:     3,
  TRANSFER:      4,
  RECYCLE:       8,
  EXPLORATION:  15,
};

var ore = {
  METAL:     1,
  CRYSTAL:   2,
  DEUTERIUM: 3,
}

var ship = { // bitmasks
  SMALL_CARGO:    0x0001,
  LARGE_CARGO:    0x0002,
  LIGHT_FIGHTER:  0x0004,
  HEAVY_FIGHTER:  0x0008,
  CRUISER:        0x0010,
  BATTLESHIP:     0x0020,
  BATTLECRUISER:  0x0040,
  DESTROYER:      0x0080,
  DEATHSTAR:      0x0100,
  BOMBER:         0x0200,
  RECYCLER:       0x0400,
  PROBE:          0x0800,
  SOLAR:          0x1000,
  COLONIZATOR:    0x2000,
  ALL:            0xFFFF,
};

function screenshot(file) {
	casper.then(function() {
	    this.capture(screenshot_dir + file);
	});
}

function screenshot_content(file) {
	casper.then(function() {
		this.captureSelector(screenshot_dir + file, 'div#inhalt');
	});
}

function screenshot_area(file, area) {
	casper.then(function() {
		this.capture(screenshot_dir + file, area);
	});
}

function format_date(m) {
	return m.getFullYear()
	       + '-' + ('0' + (m.getMonth()+1)).slice(-2)
	       + '-' + ('0' + m.getDate()).slice(-2)
	       + ' ' + ('0' + m.getHours()).slice(-2)
	       + ':' + ('0' + m.getMinutes()).slice(-2)
	       + ':' + ('0' + m.getSeconds()).slice(-2);
}

class Logger {
	constructor(filename) {
		this.file = fs.open(filename, {mode: "a", nobuffer: true});
		this.newline = true;
	}

	write(s) {
		if (this.newline)
			this.file.write(format_date(new Date()) + ' ');
		this.file.write(s);
		this.newline = false;
	}
	writeLine(s) {
		this.write(s + '\n');
		this.newline = true;
	}
}

function login() {
	casper.waitForSelector('#loginBtn', function() {
		logger.write('login page open; ');
		output_array['logged_in'] = false;

		this.click('#loginBtn');
		this.fill('form#loginForm', {
			'uni': config['server'],
			'login': config['username'],
			'pass': config['password'],
		}, true);
		this.waitForSelector('#detailWrapper', function() {
			logger.writeLine('login done.');
		}, function() {
			logger.writeLine('derp.');
			logger.writeLine('ERROR: Login messed up, exiting.');
			this.capture(screenshot_dir + 'screenshot_derp.png');
			this.exit();
		});

	}, function() {
		logger.writeLine('could not find login button.');
		current_mission = 0;
	});
}

function open_fleet_movements() {
	casper.thenOpen(base_url + 'page=movement');

	casper.waitForSelector('div.fleetStatus span.fleetSlots', function() {
		logger.writeLine('Fleet movements opened.');

	}, function() {
		logger.write('Could not open fleet movements; ')

		if (this.exists('a#continue')) {
			logger.writeLine('No movements at this moment.');

		} else if (this.exists('#loginBtn')) {
			logger.writeLine('Upsie, logged out.');
			phantom.clearCookies();
			login();
			open_fleet_movements();
		} else {
			logger.writeLine('Still logged in but something went wrong.');
		}
	});
}

var takeoff = 0;

function verifyLogin(msg) {
	logger.write(msg + '; ')
	if (casper.exists('#loginBtn')) {
		logger.writeLine('Upsie, logged out.');
		recovery();
	} else {
		logger.writeLine('Still logged in but something went wrong.');
		current_mission = 0;
	}
	screenshot('screenshot1.png')
}

function select_ships(planned_mission, planet, ships) {

	casper.thenOpen(base_url + 'page=fleet1&cp=' + planets[planet]['id'].toString(), function() {

		current_mission = planned_mission;

		this.waitForSelector('div.fleetStatus div#slots', function() {
			logger.write(planet + ': fleet ');

			if (this.exists('a#continue')) {

				if (ships & ship.SMALL_CARGO) this.click('li#button202 > div > a');
				if (ships & ship.LARGE_CARGO) this.click('li#button203 > div > a');
				if (ships & ship.RECYCLER)    this.click('li#button209 > div > a');
				if (ships & ship.DEATHSTAR)   this.click('li#button214 > div > a');

				if (this.exists('a#continue.on')) {
					this.thenClick('#continue');
					logger.write('selected; ');
					return;
				}
			}

			logger.writeLine('WARNING: No fleet available to send on ' + planet);
			current_mission = 0;

		}, function() {
			verifyLogin('Could not open fleet page')
		});
	});
}

function select_destination(planned_mission, system, position, type, speed) {
	casper.then(function() {
		if (current_mission != planned_mission)
			return;
		this.waitForSelector('form[name="details"]', function then() {
			logger.write('destination ');
			this.fill('form[name="details"]', {
				'type': String(type),
				'speed': String(speed/10),
				'system': String(system),
				'position': String(position),
			}, true);
			logger.write('selected; ');

		}, function timeout() {
			verifyLogin('Could not continue to destination page');
		});
	});
}

function send_mission(planned_mission, type, resources) {
	casper.then(function() {
		if (current_mission != planned_mission)
			return;
		this.waitForSelector('a#start', function then() {
			logger.write('mission ');
			screenshot('bug.png');

			if (type === mission.TRANSPORT)
				this.click('#missionButton3');
			else if (type === mission.TRANSFER)
				this.click('#missionButton4');
			else if (type === mission.RECYCLE)
				this.click('#missionButton8');
			else if (type === mission.EXPLORATION)
				this.click('#missionButton15');

			for (i = 0; i < resources.length; ++i) {
				if (resources[i] === ore.METAL)
					this.evaluate(function() {maxMetal();});
				else if (resources[i] === ore.CRYSTAL)
					this.evaluate(function() {maxCrystal();});
				else if (resources[i] === ore.DEUTERIUM)
					this.evaluate(function() {maxDeuterium();});
			}
			this.evaluate(function() {updateVariables();});

			if (this.exists('a#start.on')) {
				this.thenClick('a#start');
				logger.write('selected; ')
			} else {
				logger.writeLine('WARNING: Could not send fleet for some reason.')
				current_mission = 0;
			}

		}, function timeout() {
			verifyLogin('Could not load mission page')
		});
	});

	casper.then(function() {
		if (current_mission != planned_mission)
			return;
		this.waitForSelector('div.fleetStatus div#slots', function then() {
			logger.writeLine('on route.');

		}, function timeout() {
			logger.write('Could not submit mission; ')

			if (this.exists('#loginBtn')) {
				logger.writeLine('Upsie, logged out, Fleet probably not on route.');
			} else {
				logger.writeLine('Still logged in but something went wrong, fleet probably not on route.');
			}
		});
	});
}

function return_fleet(id) {
	casper.thenOpen(base_url + 'page=movement&return=' + id.toString());
}

var mission_counter = 0;
var current_mission = 0;

function send_fleet(origem, destino, speed, mission_type, ships) {

	mission_counter++;

	recovery = function() {
		phantom.clearCookies();
		login();
		send_fleet(origem, destino, speed, mission_type, ships)
	}

	select_ships(mission_counter, origem, ships);

	select_destination(mission_counter, destino['system'], destino['pos'], destino['type'], speed)

	if (mission_type == mission.RECYCLE)
		send_mission(mission_counter, mission_type, []);
	else
		send_mission(mission_counter, mission_type, [ore.DEUTERIUM, ore.CRYSTAL, ore.METAL]);
}

function reciclar(origem, destino, speed) {
	var destination = { 'id': planets[destino]['id'], 'system': planets[destino]['system'], 'pos':  planets[destino]['pos'], 'type': place.DEBRIS };
	send_fleet(origem, destination, speed, mission.RECYCLE, ship.RECYCLER)
}

function transportar(origem, destino, speed) {

	if (! planets[origem]) {
		casper.echo('Error: Invalid source');
		casper.exit();
	}

	if (! planets[destino]) {
		casper.echo('Error: Invalid destination "' + destino + '"');
		casper.exit();
	}

	if (destino === 'all') {
		casper.echo('Error: Destiny can\'t be all for transport');
		casper.exit();
	}

	if (origem === 'all')
		collect_all(destino)
	else
		send_fleet(origem, planets[destino], speed, mission.TRANSPORT, ship.SMALL_CARGO | ship.LARGE_CARGO)
}

function transferir(origem, destino, speed) {
	send_fleet(origem, planets[destino], speed, mission.TRANSFER, ship.SMALL_CARGO | ship.LARGE_CARGO | ship.DEATHSTAR)
}

function explorar(origem, speed) {
	destination = { 'id': 0, 'system': planets[origem]['system'], 'pos':  16, 'type': place.PLANET };
	send_fleet(origem, destination, speed, mission.EXPLORATION, ship.LARGE_CARGO | ship.DEATHSTAR)
}

function collect_all(destino) {
	for (planet in planets) {
		if (planet !== destino && planets[planet]['type'] === place.PLANET)
		    transportar(planet, destino, 100)
	}
}

function recycle_all() {
	for (planet in planets) {
		if (planets[planet]['type'] == place.PLANET) {
			reciclar(planet, planet, 100)
		}
	}
}

function return_flight(id) {
	casper.then(function() {
		logger.writeLine('Returning flight ' + id.toString());
		casper.thenOpen(base_url + 'page=movement&return=' + id.toString());
	});
}

function list_flights() {
	open_fleet_movements();

	casper.then(function() {

		values = this.evaluate(function() {
			flights = document.querySelectorAll('.fleetDetails');
			values = [];
			for (var f = 0; f < flights.length; ++f) {
				var fleet_id      = parseInt(flights[f].getAttribute('id').slice(5));
				var mission_type  = parseInt(flights[f].getAttribute('data-mission-type'));
				var arrival       = parseInt(flights[f].getAttribute('data-arrival-time'));
				var return_flight = flights[f].getAttribute('data-return-flight') === 'true';

				var origin = flights[f].querySelector('span.originPlanet').textContent.trim();
				var destination = flights[f].querySelector('span.destinationPlanet span').textContent.trim();

				if (return_flight)
					takeoff = flights[f].querySelector('span.starStreak div div.destination.fixed img.tooltipHTML').title;
				else
					takeoff = flights[f].querySelector('span.starStreak div div.origin.fixed img.tooltipHTML').title;

				var re = /Começo:\| (\d\d).(\d\d).(\d\d\d\d)<br>(\d\d).(\d\d).(\d\d)/;
				var m  = takeoff.match(re);
				takeoff = m[3]+'-'+m[2]+'-'+m[1]+' '+m[4]+':'+m[5]+':'+m[6];

				var details = flights[f].querySelector('span.starStreak div.route div.htmlTooltip table.fleetinfo').textContent.replace(/\./g, '');

				var re = /Metal:\s+(\d+)\s+Cristal:\s+(\d+)\s+Deutério:\s+(\d+)/;
				var m  = details.match(re);
				var metal     = parseInt(m[1]);
				var crystal   = parseInt(m[2]);
				var deuterium = parseInt(m[3]);

				values.push({'id': fleet_id,
				             'type': mission_type,
				             'takeoff': takeoff,
				             'arrival': arrival,
				             'origin': origin,
				             'destination': destination,
				             'return': return_flight,
				             'metal': metal,
				             'crystal': crystal,
				             'deuterium': deuterium,
				});
			};
			return values;
		});
		values = values.map(function(obj) {
			var t = new Date(obj['arrival'] * 1000);
			obj['arrival'] = format_date(t);
			return obj;
		});

		output_array['flights'] = values;
	});

	screenshot('flights.png');
}

function crawl_facilites(name) {

	casper.thenOpen(base_url + 'page=station&cp=' + planets[name]['id'].toString(), function() {

		this.waitForSelector('div.station14 span.level', function() {
			logger.writeLine('Facilities.');

			var values = this.evaluate(function() {
				var return_dict = {};
				var levels = {
					'robotic_factory': 'station14',
					'nanite_factory':  'station15',
					'shipyard':        'station21',
					'research_lab':    'station31',
					'terraformer':     'station33',
					'aliance_depot':   'station34',
					'lunar_base':      'station41',
					'sensor_phanlax':  'station42',
					'jump_gate':       'station43',
					'missile_silo':    'station44',
				};
				for (key in levels) {
					var node = document.querySelector('div.' + levels[key] + ' span.level');
					if (node)
						return_dict[key] = parseInt(node.textContent.trim().replace(/.*\s/g, ''));
				}
				return return_dict;
			});
			for (key in values)
				planet_values[key] = values[key];

		}, function() {
			logger.writeLine('Could not open facilities page for ' + name + '.')
		});
	});
}

function crawl_resources(name) {

	casper.thenOpen(base_url + 'page=resources&cp=' + planets[name]['id'].toString(), function() {

		this.waitForSelector('div.supply1 span.level', function() {
			logger.write(name + ': Resources; ');

			var values = this.evaluate(function() {

				var return_dict = {};

				var infobox = document.querySelector('div#myPlanets a.planetlink.active');
				if (infobox) {
					var re = /km \((\d+)\/(\d+)\)<br>(-?\d+) °C para (-?\d+)°C/;
					var m = infobox.title.match(re);
					return_dict['temp_min']    = parseInt(m[3]);
					return_dict['temp_max']    = parseInt(m[4]);
					return_dict['slots_used']  = parseInt(m[1]);
					return_dict['slots_total'] = parseInt(m[2]);
				}

				var levels = {
					'metal_level':       'supply1',
			                'crystal_level':     'supply2',
			                'deuterium_level':   'supply3',
			                'solar_level':       'supply4',
			                'fusion_level':      'supply12',
			                'satellites':        'supply212',
			                'metal_storage':     'supply22',
			                'crystal_storage':   'supply23',
			                'deuterium_storage': 'supply24',
				};
				for (key in levels) {
					var node = document.querySelector('div.' + levels[key] + ' span.level');
					if (node)
						return_dict[key] = parseInt(node.textContent.trim().replace(/.*\s/g, ''));
				}

				var resources = ['metal', 'crystal', 'deuterium', 'energy'];
				for (i in resources)
					return_dict[resources[i]] = document.querySelector('ul#resources span#resources_' + resources[i]).textContent.replace(/\./g, '');

				return return_dict;
			});
			for (key in values)
				planet_values[key] = values[key];

		}, function() {
			logger.writeLine('Could not open resources page for ' + name + '.')
		});
	});

	casper.thenOpen(base_url + 'page=resourceSettings&cp=' + planets[name]['id'].toString(), function() {

		this.waitForSelector('table.listOfResourceSettingsPerPlanet span.dropdown a', function() {
			logger.write('Settings; ');

			var values = this.evaluate(function() {
				var effic = document.querySelectorAll('table.listOfResourceSettingsPerPlanet span.dropdown a');

				return {
					'metal_effic':     parseInt(effic[0].getAttribute("data-value")),
			                'crystal_effic':   parseInt(effic[1].getAttribute("data-value")),
			                'deuterium_effic': parseInt(effic[2].getAttribute("data-value")),
				};
			});
			for (key in values)
				planet_values[key] = values[key];

		}, function() {
			logger.writeLine('Could not open resources settings for ' + name + '.')
		});
	});
}

function crawl_planet(name) {
	casper.then(function() {
		planet_values = {'name': name, 'type': 'planet', 'coords': planets[name]['coords']};

		if (planets[name]['type'] === place.PLANET)
			planet_values['type'] = 'planet';

		else if (planets[name]['type'] === place.MOON)
			planet_values['type'] = 'moon';
	});

	crawl_resources(name);
	crawl_facilites(name);

	casper.then(function() {
		output_array['resources'].push(planet_values);
	});
}

function crawl_planets() {
	output_array['resources'] = [];
	for (planet in planets)
		crawl_planet(planet);
}

function crawl_research() {

	casper.thenOpen(base_url + 'page=research', function() {

		this.waitForSelector('div#inhalt div#planet', function() {
			logger.writeLine('Research page opened.');

			output_array['research'] = this.evaluate(function() {
				var levels = {
					'espionage_tech':   'details106',
					'computer_tech':    'details108',
					'weapon_tech':      'details109',
					'shielding_tech':   'details110',
					'armour_tech':      'details111',
					'energy_tech':      'details113',
					'hyperspace_tech':  'details114',
					'combustion_drive': 'details115',
					'impulse_drive':    'details117',
					'hyperspace_drive': 'details118',
					'laser_tech':       'details120',
					'ion_tech':         'details121',
					'plasma_tech':      'details122',
					'research_network': 'details123',
					'astrophysics':     'details124',
					'graviton_tech':    'details199',
				};
				return_dict = {};
				for (key in levels) {
					var node = document.querySelector('a#' + levels[key] + ' span.level');
					if (node)
						return_dict[key] = parseInt(node.textContent.trim().replace(/.*\s/g, ''));
				}
				return return_dict;
			});
		}, function() {
			logger.writeLine('Could not open research page.')
		});
	});

	screenshot_area('research.png', {top:431, left:235, width: 670, height: 400});
}

function get_unread_messages() {

	casper.waitForSelector('span.new_msg_count.totalMessages.news', function() {
		total_messages = this.evaluate(function() {
			return parseInt(document.querySelector('span.new_msg_count.totalMessages.news').getAttribute('data-new-messages'));
		});
		output_array['total_unread_messages'] = total_messages;
	}, function() {
		logger.writeLine('Could not find messages icon.')
	});
}

function crawl_messages() {

	casper.then(function() {

		this.open(base_url + 'page=messages');

		this.waitForSelector('ul.pagination', function() {
			logger.writeLine('Messages page open.');

			values = this.evaluate(function() {

				var re = /.*\((\d+)\)/;

				var spy_match = document.querySelector('a#ui-id-13.txt_link.ui-tabs-anchor').textContent.trim().match(re);
				var spy_value = spy_match ? parseInt(spy_match[1]) : 0;

				var combat_match = document.querySelector('a#ui-id-15.txt_link.ui-tabs-anchor').textContent.trim().match(re);
				var combat_value = combat_match ? parseInt(combat_match[1]) : 0;

				var exploration_match = document.querySelector('a#ui-id-17.txt_link.ui-tabs-anchor').textContent.trim().match(re);
				var exploration_value = exploration_match ? parseInt(exploration_match[1]) : 0;

				var transport_match = document.querySelector('a#ui-id-19.txt_link.ui-tabs-anchor').textContent.trim().match(re);
				var transport_value = transport_match ? parseInt(transport_match[1]) : 0;

				var other_match = document.querySelector('a#ui-id-21.txt_link.ui-tabs-anchor').textContent.trim().match(re);
				var other_value = other_match ? parseInt(other_match[1]) : 0;

				return {
					'spy':         spy_value,
					'combat':      combat_value,
					'exploration': exploration_value,
					'transport':   transport_value,
					'other':       other_value,
				};
			});

			output_array['messages'] = values;

		}, function() {
			logger.writeLine('Could not open messages page.')
		});
	});

	screenshot_area('messages.png', {top:210, left:235, width: 680, height: 300});
}

function get_bodies_list() {

	var planets = {}

	var data = fs.read(player_data);
	parser = new DOMParser();
	xmldoc = parser.parseFromString(data, 'text/xml');

	planet_nodes = xmldoc.getElementsByTagName('planets')[0].childNodes;

	for (i = 0; i < planet_nodes.length; i++) {
		var name = planet_nodes[i].getAttribute('name').toLowerCase();
		var id = parseInt(planet_nodes[i].getAttribute('id'));
		var coords = planet_nodes[i].getAttribute('coords');
		var re = /(\d+):(\d+):(\d+)/;
		var m  = coords.match(re);
		var galaxy   = parseInt(m[1]);
		var system   = parseInt(m[2]);
		var position = parseInt(m[3]);
		planets[name] = {'id': id, 'coords': coords, 'galaxy': galaxy, 'system': system, 'pos': position, 'type': place.PLANET};

		moon_nodes = planet_nodes[i].getElementsByTagName('moon');

		if (moon_nodes.length == 1) {
			var name = moon_nodes[0].getAttribute('name').toLowerCase();
			var id = parseInt(moon_nodes[0].getAttribute('id'));
			planets[name] = {'id': id, 'galaxy': galaxy, 'system': system, 'pos': position, 'type': place.MOON};
		}
	}

	return planets
}

function get_info(query) {

	switch (query) {
		case 'flights':
			break;
		case 'research':
			crawl_research();
			break;
		case 'messages':
			crawl_messages();
			break;
		case 'resources':
			crawl_planets();
			break
		case 'all':
			list_flights();
			crawl_research();
			crawl_planets();
			crawl_messages();
			break;
	}
}


function usage() {
	casper.echo('Usage: casperjs ogame.js (collect_all|recycle_all|fleetsave|transfer|transport|return|list) [options]');
	casper.exit();
}

function parseCli() {

	// Convert all arguments to string and lowercase
	var args = [];
	for (i = 0; i < casper.cli.args.length; ++i) {
		args[i] = casper.cli.get(i).toString().toLowerCase();
	}

	if (args.length > 0) {
		switch(args[0]) {

			case 'collect_all':
				if (args.length == 2)
					collect_all(args[1]);
				else
					usage();
				break;

			case 'recycle_all':
				if (args.length == 1)
					recycle_all();
				else
					usage();
				break;

			case 'transfer':
				if (args.length == 4)
					transferir(args[1], args[2], parseInt(args[3]))
				else
					usage();
				break;

			case 'transport':
				if (args.length == 4)
					transportar(args[1], args[2], parseInt(args[3]))
				else
					usage();
				break;

			case 'recycle':
				if (args.length == 4)
					reciclar(args[1], args[2], parseInt(args[3]))
				else
					usage();
				break;

			case 'explore':
				if (args.length == 3)
					explorar(args[1], parseInt(args[2]))
				else
					usage();
				break;

			case 'return':
				if (args.length == 2)
					return_flight(parseInt(args[1]));
				else
					usage();
				break;

			case 'list':
				break;

			case 'get':
				if (args.length == 2)
					get_info(args[1]);
				else
					usage();
				break;

			default:
				usage();
		}

		screenshot('last.png')

		list_flights();

		get_unread_messages();

		casper.then(function() {
			this.echo(JSON.stringify(output_array, undefined, 2));
		});

	} else {
		usage();
	}
}

var casper = require('casper').create({
	verbose: true,
	//logLevel: 'debug',
});
var utils = require('utils');
var system = require('system');
var fs = require('fs');

// Read config file
var config_string = fs.read(config_file);
var config = JSON.parse(config_string);

var base_url = 'https://' + config['server'] + '/game/index.php?';

var logger = new Logger("stderr.log");

casper.options.waitTimeout = 2000;
//casper.options.viewportSize = {width: 1280, height: 800};
casper.userAgent("Mozilla/5.0 (X11; Linux x86_64; rv:48.0) Gecko/20100101 Firefox/48.0");
casper.start("about:blank");

casper.zoom(1);

var data = JSON.parse(fs.read(cookie_jar));

// When setting cookies, SlimerJS ignores expired ones
// but we want to reuse the previous login
data.forEach(function(e) {
	e.expiry = 0;
	e.expires = null;
});

phantom.cookies = data;

casper.thenOpen(base_url);
casper.then(function() {logger.write('Page open: ');});
logged_in = false;
casper.waitForSelector('#detailWrapper', function() {
	logger.writeLine('logged in.');
	logged_in = true;
	output_array['logged_in'] = true;
}, function() {
	logger.write('not logged in; ');
	logged_in = false;
	output_array['logged_in'] = false;
},2000);

casper.then(function() {
	if(!logged_in) {
		phantom.clearCookies();
		login();
	}
});

casper.then(function() {
	var cookies = JSON.stringify(phantom.cookies);
	fs.write(cookie_jar, cookies, 644);
});

var planets = get_bodies_list();
var output_array = {version: 2};

parseCli();
casper.run();
