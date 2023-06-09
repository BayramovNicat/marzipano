/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var mat4 = require('gl-matrix').mat4;
var vec3 = require('gl-matrix').vec3;
var clearOwnProperties = require('../util/clearOwnProperties');

var WebGlCommon = require('./WebGlCommon');
var createConstantBuffers = WebGlCommon.createConstantBuffers;
var destroyConstantBuffers = WebGlCommon.destroyConstantBuffers;
var createShaderProgram = WebGlCommon.createShaderProgram;
var destroyShaderProgram = WebGlCommon.destroyShaderProgram;
var enableAttributes = WebGlCommon.enableAttributes;
var disableAttributes = WebGlCommon.disableAttributes;
var setViewport = WebGlCommon.setViewport;
var setupPixelEffectUniforms = WebGlCommon.setupPixelEffectUniforms;

var setDepth = WebGlCommon.setDepth;
var setTexture = WebGlCommon.setTexture;

var vertexSrc = require('../shaders/vertexNormal');
var fragmentSrc = require('../shaders/fragmentNormal');

var vertexIndices = [0, 1, 2, 0, 2, 3];
var vertexPositions = [-0.5, -0.5, 0.0, 0.5, -0.5, 0.0, 0.5, 0.5, 0.0, -0.5, 0.5, 0.0];
var textureCoords = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];

var attribList = ['aVertexPosition', 'aTextureCoord'];
var uniformList = [
  'uDepth', 'uOpacity', 'uSampler', 'uProjMatrix', 'uViewMatrix', 'uModelMatrix', 'uViewportMatrix',
  'uColorOffset', 'uColorMatrix'
];


function WebGlBaseRenderer(gl) {
  this.gl = gl;

  // The projection matrix positions the tiles in world space.
  // We compute it in Javascript because lack of precision in the vertex shader
  // causes seams to appear between adjacent tiles at large zoom levels.
  this.projMatrix = mat4.create();

  // TODO Why save this value here? the same question to the projMatrix.
  this.viewMatrix = mat4.create();

  // The viewport matrix responsible for viewport clamping.
  // See setViewport() for an explanation of how it works.
  this.viewportMatrix = mat4.create();

  // Translation and scale vectors for tiles.
  this.translateVector = vec3.create();
  this.scaleVector = vec3.create();

  this.constantBuffers = createConstantBuffers(gl, vertexIndices, vertexPositions, textureCoords);

  this.shaderProgram = createShaderProgram(gl, vertexSrc, fragmentSrc, attribList, uniformList);
}

WebGlBaseRenderer.prototype.destroy = function() {
  destroyConstantBuffers(this.gl, this.constantBuffers);
  destroyShaderProgram(this.gl, this.shaderProgram);
  clearOwnProperties(this);
};

WebGlBaseRenderer.prototype.startLayer = function(layer, rect) {
  var gl = this.gl;
  var shaderProgram = this.shaderProgram;
  var constantBuffers = this.constantBuffers;
  var viewportMatrix = this.viewportMatrix;

  gl.useProgram(shaderProgram);

  enableAttributes(gl, shaderProgram);

  setViewport(gl, layer, rect, viewportMatrix);
  gl.uniformMatrix4fv(shaderProgram.uViewportMatrix, false, viewportMatrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, constantBuffers.vertexPositions);
  gl.vertexAttribPointer(shaderProgram.aVertexPosition, 3, gl.FLOAT, gl.FALSE, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, constantBuffers.textureCoords);
  gl.vertexAttribPointer(shaderProgram.aTextureCoord, 2, gl.FLOAT, gl.FALSE, 0, 0);

  setupPixelEffectUniforms(gl, layer.effects(), {
    opacity: shaderProgram.uOpacity,
    colorOffset: shaderProgram.uColorOffset,
    colorMatrix: shaderProgram.uColorMatrix
  });
};


WebGlBaseRenderer.prototype.endLayer = function(layer, rect) {
  var gl = this.gl;
  var shaderProgram = this.shaderProgram;
  disableAttributes(gl, shaderProgram);
};


WebGlBaseRenderer.prototype.renderTile = function(tile, texture, layer, layerZ) {
  var gl = this.gl;
  var shaderProgram = this.shaderProgram;
  var constantBuffers = this.constantBuffers;
  var projMatrix = this.projMatrix;
  var viewMatrix = this.viewMatrix;
  var translateVector = this.translateVector;
  var scaleVector = this.scaleVector;

  mat4.copy(projMatrix, layer.view().projection());
  gl.uniformMatrix4fv(shaderProgram.uProjMatrix, false, projMatrix);

  mat4.copy(viewMatrix, layer.view().viewMatrix());
  gl.uniformMatrix4fv(shaderProgram.uViewMatrix, false, viewMatrix);
  
  // Generate ModelMatrix.
  // TODO Cache the matrix in the tile object?
  translateVector[0] = tile.centerX();
  translateVector[1] = tile.centerY();
  translateVector[2] = -0.5;

  scaleVector[0] = tile.scaleX();
  scaleVector[1] = tile.scaleY();
  scaleVector[2] = 1.0;

  var modelMatrix = mat4.create();
  mat4.rotateX(modelMatrix, modelMatrix, tile.rotX());
  mat4.rotateY(modelMatrix, modelMatrix, tile.rotY());
  mat4.translate(modelMatrix, modelMatrix, translateVector);
  mat4.scale(modelMatrix, modelMatrix, scaleVector);

  gl.uniformMatrix4fv(shaderProgram.uModelMatrix, false, modelMatrix);

  setDepth(gl, shaderProgram, layerZ, tile.z);
  setTexture(gl, shaderProgram, texture);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, constantBuffers.vertexIndices);
  gl.drawElements(gl.TRIANGLES, vertexIndices.length, gl.UNSIGNED_SHORT, 0);
};


module.exports = WebGlBaseRenderer;
