var work_dir = './';
var screenshot_dir = work_dir + '/screenshots/';
var cookie_jar = work_dir + '/cookies.json';
var config_file = work_dir + '/config.json';
var log_file = work_dir + '/stderr.log';

// Block URLs matching this to avoid unnecessary page slowdowns
var blocked_urls = [ 'ads-delivery', 'alexametrics' ];

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

function select_ships(planet, ships) {

	casper.thenOpen(ogame.base_url + 'page=fleet1&cp=' + ogame.planet(planet).id.toString(), function() {

		logger.write(planet + ': ');

		this.waitForSelector('div.fleetStatus div#slots', function() {
			logger.write('fleet ');

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

		}, function() {
			ogame.abort('Could not open fleet page')
		});
	});
}

function select_destination(system, position, type, speed) {
	casper.waitForSelector('form[name="details"]', function then() {
		logger.write('destination ');
		this.fill('form[name="details"]', {
			'type': String(type),
			'speed': String(speed/10),
			'system': String(system),
			'position': String(position),
		}, true);
		logger.write('selected; ');

	}, function timeout() {
		ogame.abort('Could not continue to destination page');
	});
}

function send_mission(type, resources) {
	casper.waitForSelector('a#start', function() {
		logger.write('mission ');

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
		this.evaluate(function() {updateVariables();}); // This is a function from the ogame JS

		if (this.exists('a#start.on')) {
			this.thenClick('a#start');
			logger.write('selected; ')
		} else {
			logger.writeLine('WARNING: Could not send fleet for some reason.')
		}

	}, function() {
		ogame.abort('Could not load mission page')
	});

	casper.waitForSelector('div.fleetStatus div#slots', function then() {
		logger.writeLine('on route.');

	}, function() {
		logger.write('Could not submit mission; ')

		if (this.exists('#loginBtn')) {
			ogame.abort('Upsie, logged out, fleet probably not on route.');
		} else {
			ogame.abort('Still logged in but something went wrong, fleet probably not on route.');
		}
	});
}

function return_fleet(id) {
	casper.thenOpen(ogame.base_url + 'page=movement&return=' + id.toString());
}

function send_fleet(origem, destino, speed, mission_type, ships) {

	select_ships(origem, ships);

	select_destination(destino['system'], destino['pos'], destino['type'], speed)

	if (mission_type == mission.RECYCLE)
		send_mission(mission_type, []);
	else
		send_mission(mission_type, [ore.DEUTERIUM, ore.CRYSTAL, ore.METAL]);
}

function reciclar(origem, dest_name, speed) {
	var dest_planet = ogame.planet(dest_name);
	var destination = { 'id': dest_planet.id, 'system': dest_planet.system, 'pos':  dest_planet.pos, 'type': place.DEBRIS };
	send_fleet(origem, destination, speed, mission.RECYCLE, ship.RECYCLER)
}

function transportar(origem, destino, speed) {

	if (! ogame.planet(origem)) {
		ogame.abort('Error: Invalid source');
	}

	if (! ogame.planet(destino)) {
		ogame.abort('Error: Invalid destination "' + destino + '"');
	}

	if (destino === 'all') {
		ogame.abort('Error: Destiny can\'t be all for transport');
	}

	if (origem === 'all')
		collect_all(destino)
	else
		send_fleet(origem, ogame.planet(destino), speed, mission.TRANSPORT, ship.SMALL_CARGO | ship.LARGE_CARGO)
}

function transferir(origem, dest_name, speed) {
	send_fleet(origem, ogame.planet(dest_name), speed, mission.TRANSFER, ship.SMALL_CARGO | ship.LARGE_CARGO | ship.DEATHSTAR)
}

function explorar(origem, speed) {
	var destination = { 'id': 0, 'system': ogame.planet(origem),system, 'pos':  16, 'type': place.PLANET };
	send_fleet(origem, destination, speed, mission.EXPLORATION, ship.LARGE_CARGO | ship.DEATHSTAR)
}

function collect_all(destino) {
	for (name in ogame.planets) {
		if (planet !== destino && ogame.planet(name).type === place.PLANET)
		    transportar(name, destino, 100)
	}
}

function recycle_all() {
	for (name in ogame.planets) {
		if (ogame.planet(name).type == place.PLANET) {
			reciclar(name, name, 100)
		}
	}
}

function return_flight(id) {
	casper.then(function() {
		logger.writeLine('Returning flight ' + id.toString());
		casper.thenOpen(ogame.base_url + 'page=movement&return=' + id.toString());
	});
}

function parse_fleet_movements() {
	flights = document.querySelectorAll('.fleetDetails');
	values = [];
	for (var f = 0; f < flights.length; ++f) {
		var fleet_id      = parseInt(flights[f].getAttribute('id').slice(5));
		var mission_type  = parseInt(flights[f].getAttribute('data-mission-type'));
		var arrival       = parseInt(flights[f].getAttribute('data-arrival-time'));
		var return_flight = flights[f].getAttribute('data-return-flight') === 'true';

		var origin = flights[f].querySelector('span.originPlanet').textContent.trim();
		var destination = flights[f].querySelector('span.destinationPlanet span').textContent.trim();

		var takeoff;
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
}

function crawl_facilites(planet) {

	casper.thenOpen(ogame.base_url + 'page=station&cp=' + planet.id.toString(), function() {

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
			ogame.abort('Could not open facilities page for ' + planet.name + '.')
		});
	});
}

function crawl_resources(planet) {

	casper.thenOpen(ogame.base_url + 'page=resources&cp=' + planet.id.toString(), function() {

		this.waitForSelector('div.supply1 span.level', function() {
			logger.write(planet.name + ': Resources; ');

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
			ogame.abort('Could not open resources page for ' + planet.name + '.')
		});
	});

	casper.thenOpen(ogame.base_url + 'page=resourceSettings&cp=' + planet.id.toString(), function() {

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
			ogame.abort('Could not open resources settings for ' + planet.name + '.')
		});
	});
}

function crawl_planet(planet) {
	casper.then(function() {
		planet_values = {'name': planet.name, 'type': 'planet', 'coords': planet.coords};

		if (planet.type === place.PLANET)
			planet_values['type'] = 'planet';

		else if (planet.type === place.MOON)
			planet_values['type'] = 'moon';
	});

	crawl_resources(planet);
	crawl_facilites(planet);

	casper.then(function() {
		ogame.output_array['resources'].push(planet_values);
	});
}

function crawl_planets() {
	ogame.output_array['resources'] = [];
	for (name in ogame.planets) {
		var planet = ogame.planet(name)
		crawl_planet(planet);
	}
}

function crawl_research() {

	casper.thenOpen(ogame.base_url + 'page=research', function() {

		this.waitForSelector('div#inhalt div#planet', function() {
			logger.writeLine('Research page opened.');

			var result = this.evaluate(function() {
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

			ogame.result('research', result);
		}, function() {
			ogame.abort('Could not open research page.')
		});
	});

	screenshot_area('research.png', {top:431, left:235, width: 670, height: 400});
}

function crawl_messages() {

	casper.thenOpen(ogame.base_url + 'page=messages', function() {

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

			ogame.result('messages', values);

		}, function() {
			ogame.abort('Could not open messages page.')
		});
	});

	screenshot_area('messages.png', {top:210, left:235, width: 680, height: 300});
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
		case 'planets':
			list_planets();
			break
		case 'all':
			ogame.list_flights();
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

		ogame.list_flights();

		ogame.get_unread_messages();

		casper.then(ogame.dump_results);

	} else {
		usage();
	}
}

class Cookies {
	constructor(filename) {
		this.file = filename;
		this.load();
	}

	load() {
		var data = JSON.parse(fs.read(this.file));

		// When setting cookies, SlimerJS ignores expired ones
		// but we want to reuse the previous login
		data.forEach(function(e) {
			e.expiry = 0;
			e.expires = null;
		});

		phantom.cookies = data;
	}

	save() {
		var cookies = JSON.stringify(phantom.cookies);
		fs.write(this.file, cookies, 644);
	}

	clear() {
		phantom.clearCookies();
	}
}

class Ogame {

	constructor(config_file) {

		var config = JSON.parse(fs.read(config_file));
		this.server   = config.server;
		this.username = config.username;
		this.password = config.password;

		this.base_url = 'https://' + this.server + '/game/index.php?';

		this.output_array = {
			'version': 2,
			'logged_in': false,
			'success': true,
		};

		this.planets = {};

		casper.options.waitTimeout = 5000;
		casper.options.viewportSize = {width: 1280, height: 900};
		casper.userAgent("Mozilla/5.0 (X11; Linux x86_64; rv:58.0) Gecko/20100101 Firefox/58.0");

		casper.on('resource.requested', function(data, request) {
			blocked_urls.forEach(function(name){
				if (data.url.indexOf(name) != -1) {
					//logger.write("Aborting request to " + data.url)
					request.abort();
				}
			});
			//console.log("Request to " + data.url)
		});

		this.open();
		this.crawl_planet_list();
	}

	open() {
		casper.start(this.base_url, function() {
			logger.write('Page open: ');
		});

		casper.waitForSelector('#detailWrapper', function() {
			logger.writeLine('logged in.');
			ogame.result('logged_in', true);

		}, function() {
			logger.write('not logged in; ');
			ogame.result('logged_in', false);
			ogame.login();
		}, 2000);
	}

	login() {
		var server = this.server;
		var username = this.username;
		var password = this.password;

		casper.waitForSelector('#loginBtn', function() {

			logger.write('login page open; ');
			ogame.result('logged_in', false);

			this.click('#loginBtn');
			this.fill('form#loginForm', {
				'uni': server,
				'login': username,
				'pass': password,
			}, true);

			this.waitForSelector('#detailWrapper', function() {
				logger.writeLine('login done.');
				cookies.save();

			}, function() {
				this.capture(screenshot_dir + 'screenshot_derp.png');
				ogame.abort('ERROR: Login messed up, exiting.');
			});

		}, function() {
			ogame.abort('could not find login button.');
		}, 5000);
	}

	result(name, value) {
		this.output_array[name] = value;
	}

	dump_results() {
		casper.echo(JSON.stringify(ogame.output_array, undefined, 2));
	}

	abort(reason) {
		screenshot('abort.png');
		this.result('success', false);
		this.dump_results();
		logger.writeLine(reason);
		casper.exit();
	}

	planet(name) {
		return this.planets[name];
	}

	list_flights() {
		var flights_selector = 'div.fleetStatus span.fleetSlots';

		casper.then(function() {
			if (!casper.visible(flights_selector))
				casper.open(ogame.base_url + 'page=movement');
		});

		casper.waitForSelector(flights_selector, function() {
			logger.writeLine('Fleet movements opened.');

		}, function() {
			logger.write('Could not open fleet movements; ')

			if (casper.exists('a#continue')) {
				logger.writeLine('No movements at this moment.');

			} else if (casper.exists('#loginBtn')) {
				ogame.abort('Upsie, logged out.');

			} else {
				ogame.abort('Still logged in but something went wrong.');
			}
		}, 2000);

		casper.then(function() {
			var values = casper.evaluate(parse_fleet_movements);
			values = values.map(function(obj) {
				var t = new Date(obj['arrival'] * 1000);
				obj['arrival'] = format_date(t);
				return obj;
			});
			ogame.result('flights', values);
		});
		screenshot('flights.png');
	}

	get_unread_messages() {
		casper.then(function() {
			if(casper.exists('span.new_msg_count.totalMessages.news')) {
				var total_messages = this.evaluate(function() {
					return parseInt(document.querySelector('span.new_msg_count.totalMessages.news').getAttribute('data-new-messages'));
				});
				ogame.result('total_unread_messages', total_messages);
			} else {
				logger.writeLine('Could not find messages icon.')
			}
		});
	}

	crawl_planet_list() {
		casper.waitForSelector('div#planetList', function() {
			logger.write('Collecting planets info; ')

			var result = this.evaluate(function() {
				var return_dict = {};
				var planets = document.querySelectorAll('div#planetList div');
				planets.forEach(function(elem) {

					var name = elem.querySelector('span.planet-name').textContent.toLowerCase();

					var coords = elem.querySelector('span.planet-koords').textContent.match(/(\d+):(\d+):(\d+)/);
					var galaxy = parseInt(coords[1]);
					var system = parseInt(coords[2]);
					var pos    = parseInt(coords[3]);

					return_dict[name] = {
						name:	name,
						type:   1, // Planet
						id:     parseInt(elem.id.match(/planet-(\d+)/)[1]),
						coords: coords[0],
						galaxy: galaxy,
						system: system,
						pos:    pos,
					};

					var moon = elem.querySelector('a.moonlink');
					if (moon) {
						var name = moon.querySelector('img').alt.toLowerCase();
						return_dict[name] = {
							name:	name,
							type:   3, // Moon
							id:     parseInt(moon.href.match(/(\d+)$/)[1]),
							coords: coords[0],
							galaxy: galaxy,
							system: system,
							pos:    pos,
						};
					}
				});
				return return_dict;
			});

			//ogame.result('planets', result);
			ogame.planets = result;
			logger.writeLine('Saved.')
		}, function() {
			ogame.abort('Could not find planet list.')
		});
	}

	list_planets() { // Useful for debugging
		this.output_array['planets'] = this.planets;
	}
}

var casper = require('casper').create({
	verbose: true,
	//logLevel: 'debug',
});
var utils = require('utils');
var system = require('system');
var fs = require('fs');

var logger = new Logger(log_file);

var cookies = new Cookies(cookie_jar);

var ogame = new Ogame(config_file);

// Run one time to login and collect planets data
casper.run(function() {
	// And only after that run the action requested from the cli
	// This way the second run can use the planet data collected before
	parseCli();
	casper.run();
});


// vim: ts=4:sw=4
