// JS rounding errors mean things that should be treated as zero aren't always, so use this hack
const ZERO = 0.00001;

var layers = {
  world_grid: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 1,
    zIndex: 200
  },
  map_grid: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 0.25,
    zIndex: 150
  },
  debug: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 1,
    zIndex: 100
  },
  map: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 0.25,
    zIndex: 50
  },
  world: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 1,
    zIndex: 0
  }
};

const drawable_width = 400;
const drawable_height = 300;

for(key in layers) {
  var layer = layers[key];

  layer.context = layer.canvas.getContext('2d');

  layer.canvas.width = Math.round(drawable_width * layer.size);
  layer.canvas.height = Math.round(drawable_height * layer.size);

  layer.canvas.style.position = 'absolute';
  layer.canvas.style.top = 0;
  layer.canvas.style.left = 0;
  layer.canvas.style.zIndex = layer.zIndex;

  document.body.appendChild(layer.canvas);
}

// map grid
layers.map_grid.context.strokeStyle = "rgb(50, 50, 50)";

layers.map_grid.context.beginPath();

layers.map_grid.context.moveTo(0, layers.map_grid.canvas.height / 2);
layers.map_grid.context.lineTo(layers.map_grid.canvas.width, layers.map_grid.canvas.height / 2);

layers.map_grid.context.moveTo(layers.map_grid.canvas.width / 2, 0);
layers.map_grid.context.lineTo(layers.map_grid.canvas.width / 2, layers.map_grid.canvas.height);

layers.map_grid.context.stroke();
layers.map_grid.context.closePath();


// world grid
layers.world_grid.canvas.style.display = 'none';
layers.world_grid.context.strokeStyle = "rgb(150, 150, 150)";

layers.world_grid.context.beginPath();

for (var i = 0.1; i < 1; i += 0.1) {
  layers.world_grid.context.moveTo(layers.world_grid.canvas.width * i, 0);
  layers.world_grid.context.lineTo(layers.world_grid.canvas.width * i, layers.world_grid.canvas.height);

  layers.world_grid.context.moveTo(0, layers.world_grid.canvas.height * i);
  layers.world_grid.context.lineTo(layers.world_grid.canvas.width, layers.world_grid.canvas.height * i);
}

layers.world_grid.context.stroke();
layers.world_grid.context.closePath();

const fov = 90; // degrees

// Calculate the tangent of half the field of view, so that trig can be used to calculate the ratio
// between distance from view and viewed width. Needs to be halved to make a right angle triangle with known
// angle and adjacent. Convert to radians as that's what JS expects
var half_fov_rad = (fov / 2) * (Math.PI / 180);
var half_fov_tan = Math.tan(half_fov_rad);

var aspect_ratio = drawable_width / drawable_height;

var dist_to_view = 1;

var width_of_view = dist_to_view * half_fov_tan * 2;
var height_of_view = width_of_view / aspect_ratio;

var camera = {
  x: 0,
  y: 1.75,
  z: 1,
  yaw: 0,
  pitch: 0,
  roll: 0
};


var tile = [
  [
    {
      x: -2,
      y: 0,
      z: 2
    },
    {
      x: 2,
      y: 0,
      z: 2
    },
    {
      x: 2,
      y: 0,
      z: 6
    }
  ],
  [
    {
      x: -2,
      y: 0,
      z: 2
    },
    {
      x: 2,
      y: 0,
      z: 6
    },
    {
      x: -2,
      y: 0,
      z: 6
    }
  ]
]

function render_scene() {
  layers.debug.context.clearRect(0, 0, layers.debug.canvas.width, layers.debug.canvas.height);
  layers.map.context.clearRect(0, 0, layers.map.canvas.width, layers.map.canvas.height);
  layers.world.context.clearRect(0, 0, layers.world.canvas.width, layers.world.canvas.height);

  layers.world.context.fillStyle = "rgb(200, 200, 200)";
  layers.world.context.fillRect(0, 0, layers.world.canvas.width, layers.world.canvas.height);

  // map bg
  layers.map.context.fillStyle = "rgb(150, 150, 150)";
  layers.map.context.fillRect(0, 0, layers.map.canvas.width, layers.map.canvas.height);

  for (var i = 0; i < tile.length; i++) {
    var triangle = tile[i];
    var localised_triangle = [];

    for (var j = 0; j < triangle.length; j++) {
      var point = triangle[j];
      localised_triangle.push(localise_point(point, camera));
    }

    // sort by localized Z descending, so points behind camera will be last
    localised_triangle.sort((p1, p2) => p1.z < p2.z);

    var projected_triangle = [];

    // cull triangles that are entirely behind the camera
    // TODO: cull any that are completely outside the viewable area, instead of just behind the camera
    if (localised_triangle[0].z < ZERO) {
      // culled
    }
    else {
      for (var j = 0; j < localised_triangle.length; j++) {
        if (projected_triangle.length < 3) {
          var point = localised_triangle[j];

          if (point.z > ZERO) {
            projected_triangle.push(project_point(point));
          }
          else {
            // if this is the second point, then 2 out of 3 points are behind the camera, so the triangle can be truncated to in front of the camera
            if (j == 1) {
              projected_triangle.push(project_point(visible_point_on_line(localised_triangle[0], point)));
              projected_triangle.push(project_point(visible_point_on_line(localised_triangle[0], localised_triangle[2])));
            }

            // otherwise create a quad
            else if (j == 2) {
              // need to add two points to the projected shape to turn a tri into a quad
              // start with the point on the line from 0 -> 1, so that it creates the correct loop of points
              projected_triangle.push(project_point(visible_point_on_line(localised_triangle[1], point)));
              projected_triangle.push(project_point(visible_point_on_line(localised_triangle[0], point)));
            }
          }
        }
      }
    }

    layers.world.context.fillStyle = "rgb(200, 0, 0)";

    layers.world.context.beginPath();

    for (var j = 0; j < projected_triangle.length; j++) {
      var projected_point = projected_triangle[j];

      var canvas_point = projected_relative_to_canvas(projected_point, layers.world.canvas);

      if (j === 0) {
        layers.world.context.moveTo(canvas_point.x, canvas_point.y);
      }
      else {
        layers.world.context.lineTo(canvas_point.x, canvas_point.y);
      }
    }

    layers.world.context.fill();
    layers.world.context.closePath();


    // map polygons
    layers.map.context.fillStyle = "rgb(200, 0, 0)";

    layers.map.context.beginPath();

    for (j = 0; j < localised_triangle.length; j++) {
      var x = (localised_triangle[j].x * 5) + (layers.map.canvas.width / 2);
      var z = (layers.map.canvas.height / 2) - (localised_triangle[j].z * 5);

      if (j === 0) {
        layers.map.context.moveTo(x, z);
      }
      else {
        layers.map.context.lineTo(x, z);
      }
    }

    layers.map.context.fill();
    layers.map.context.closePath();
  }


}

function localise_point(point, viewer) {
  var x_distance = point.x - viewer.x;
  var y_distance = point.y - viewer.y;
  var z_distance = point.z - viewer.z;

  // translate point based on viewer angles
  // x
  // calcualte angle from world to point
  var tan_world_angle_to_point = x_distance / z_distance;
  if (isNaN(tan_world_angle_to_point)) {
    tan_world_angle_to_point = 0;
  }
  var world_angle_to_point = Math.atan(tan_world_angle_to_point);

  // calculate distance from viewer to point (hypotenuse)
  // use sin if z distance is 0, otherwise hypotenuse will be 0
  // if (pretty_much_zero(z_distance)) {
  if (z_distance < ZERO) {
    var dist_to_point = x_distance / Math.sin(world_angle_to_point);
  }
  else {
    var dist_to_point = z_distance / Math.cos(world_angle_to_point);
  }

  if (isNaN(dist_to_point)) {
    dist_to_point = 0;
  }

  // calculate angle between viewer and point
  var local_angle_to_point = world_angle_to_point - camera.yaw;

  var local_x_dist = Math.sin(local_angle_to_point) * dist_to_point;
  var local_z_dist = Math.cos(local_angle_to_point) * dist_to_point;

  return {
    x: local_x_dist,
    y: y_distance, // FIX THIS!
    z: local_z_dist
  }
}

function project_point(point) {
  var proj_x = point.x * (dist_to_view / point.z);
  var proj_y = point.y * (dist_to_view / point.z);

  return {
    x: proj_x,
    y: -proj_y
  }
}

function visible_point_on_line(from, to) {
  // extrapolate a point on the lines between from and to, that has a positive Z
  // and is therefore visible
  const extrapolation_line = {
    x: from.x - to.x,
    y: from.y - to.y,
    z: from.z - to.z
  };

  // calculate the ratio between to and from (in that order) that lands on Z of 0.1 (just in front of camera)
  const ratio = (0.1 - to.z) / extrapolation_line.z;

  // find a z value between the point to extrapolate from and the camera pane
  var extrapolated = {
    x: to.x + (extrapolation_line.x * ratio),
    y: to.y + (extrapolation_line.y * ratio),
    z: to.z + (extrapolation_line.z * ratio)
  }

  return extrapolated;
}

// function two_points_to_line(point_a, point_b) {
//   const x = point_a.x - point_b.x;
//   const y = point_a.y - point_b.y;

//   const multiplier = y / x;
//   const offset = point_a.y - (multiplier * point_a.x);

//   return {
//     multiplier: multiplier,
//     offset: offset
//   }
// }

// function find_line_intersection(line_1, line_2) {
//   const x = ((line_1.offset - line_2.offset) / (line_1.multiplier - line_2.multiplier));
//   const y = (line_1.multiplier * x) + line_1.offset;

//   return {
//     x: x,
//     y: y
//   };
// }

function projected_relative_to_canvas(relative_point, canvas) {
  relative_point.x /= width_of_view;
  relative_point.y /= height_of_view;

  return {
    x: Math.round(relative_point.x * canvas.width) + (canvas.width / 2),
    y: Math.round(relative_point.y * canvas.height) + (canvas.height / 2)
  };
}

function pretty_much_zero(value) {
  // JS sucks with floats, so check the number is _basically_ zero
  return Math.round(value * 100000000000) == 0;
}

render_scene();

document.addEventListener('keyup', function (e) {
  switch (e.key) {
    case "ArrowRight":
      camera.yaw += 5 * (Math.PI / 180);
      break;

    case "ArrowLeft":
      camera.yaw -= 5 * (Math.PI / 180);
      break;

    case "ArrowUp":
      camera.x += Math.sin(camera.yaw) * 0.2;
      camera.z += Math.cos(camera.yaw) * 0.2;
      break;

    case "ArrowDown":
      camera.x -= Math.sin(camera.yaw) * 0.2;
      camera.z -= Math.cos(camera.yaw) * 0.2;
      break;

    case ".":
      camera.z -= Math.sin(camera.yaw) * 0.2;
      camera.x += Math.cos(camera.yaw) * 0.2;
      break;

    case ",":
      camera.z += Math.sin(camera.yaw) * 0.2;
      camera.x -= Math.cos(camera.yaw) * 0.2;
      break;
  }
  render_scene();
});