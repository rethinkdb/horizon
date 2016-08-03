/* global describe, it */

'use strict';

const checkProjectName = require('../../src/utils/check-project-name');
const assert = require('chai').assert;

describe('checkProjectName', () => {
  describe('when passed null for a directory', () => {
    const prospectiveName = null;
    const dirList = [];
    it("doesn't change directory", (done) => {
      const goodCwd = '/foo/bar/Ba_z';
      const res = checkProjectName(prospectiveName, goodCwd, dirList);
      assert.propertyVal(res, 'chdirTo', false);
      assert.propertyVal(res, 'dirName', 'Ba_z');
      assert.propertyVal(res, 'projectName', 'Ba_z');
      assert.propertyVal(res, 'createDir', false);
      done();
    });
    it('throws if the cwd has invalid chars', (done) => {
      const badCwd = '/foo/bar/b*a&z';
      assert.throws(() => {
        checkProjectName(prospectiveName, badCwd, dirList);
      }, '*&');
      done();
    });
    it('sets projectName to dehyphenated cwd if fixable', (done) => {
      const fixableCwd = '/foo/bar/ba-z';
      const res = checkProjectName(
        prospectiveName, fixableCwd, dirList);
      assert.propertyVal(res, 'projectName', 'ba_z');
      assert.propertyVal(res, 'dirName', 'ba-z');
      assert.propertyVal(res, 'chdirTo', false);
      assert.propertyVal(res, 'createDir', false);
      done();
    });
  });
  describe('when passed "." as a directory', () => {
    const prospectiveName = '.';
    const dirList = [];
    it("doesn't change directory", (done) => {
      const goodCwd = '/foo/bar/Ba_z';
      const res = checkProjectName(prospectiveName, goodCwd, dirList);
      assert.propertyVal(res, 'chdirTo', false);
      assert.propertyVal(res, 'dirName', 'Ba_z');
      assert.propertyVal(res, 'projectName', 'Ba_z');
      assert.propertyVal(res, 'createDir', false);
      done();
    });
    it('throws if the cwd has invalid chars', (done) => {
      const badCwd = '/foo/bar/b*a&z';
      assert.throws(() => {
        checkProjectName(prospectiveName, badCwd, dirList);
      }, '*&');
      done();
    });
    it('sets projectName to dehyphenated cwd if fixable', (done) => {
      const fixableCwd = '/foo/bar/ba-z';
      const res = checkProjectName(prospectiveName, fixableCwd, dirList);
      assert.propertyVal(res, 'projectName', 'ba_z');
      assert.propertyVal(res, 'dirName', 'ba-z');
      assert.propertyVal(res, 'chdirTo', false);
      assert.propertyVal(res, 'createDir', false);
      done();
    });
  });
  describe('when passed a non-existing directory', () => {
    const dirList = [ 'a', 'b', 'c' ];
    const cwd = '/foo/bar';
    it('creates the directory when name is valid', (done) => {
      const results = checkProjectName('Ba_z9', cwd, dirList);
      assert.propertyVal(results, 'projectName', 'Ba_z9');
      assert.propertyVal(results, 'createDir', true);
      assert.propertyVal(results, 'chdirTo', '/foo/bar/Ba_z9');
      assert.propertyVal(results, 'dirName', 'Ba_z9');
      done();
    });
    it('creates the directory when name is fixable', (done) => {
      const results = checkProjectName('Ba-z9', cwd, dirList);
      assert.propertyVal(results, 'projectName', 'Ba_z9');
      assert.propertyVal(results, 'createDir', true);
      assert.propertyVal(results, 'chdirTo', '/foo/bar/Ba-z9');
      assert.propertyVal(results, 'dirName', 'Ba-z9');
      done();
    });
    it('throws an error if the name is not fixable', (done) => {
      assert.throws(() => {
        checkProjectName('Some*Bad+Name', cwd, dirList);
      }, '*+');
      done();
    });
  });
  describe('when passed an existing directory', () => {
    const dirList = [ 'a', 'Ba-z', 'B^a%z', 'Ba_z9' ];
    const cwd = '/foo/bar';
    it('errors if given an invalid projectName', (done) => {
      assert.throws(() => {
        checkProjectName('B^%z', cwd, dirList);
      }, '^%');
      done();
    });
    it('changes directory  if the name is good', (done) => {
      const res = checkProjectName('Ba_z9', cwd, dirList);
      assert.propertyVal(res, 'dirName', 'Ba_z9');
      assert.propertyVal(res, 'projectName', 'Ba_z9');
      assert.propertyVal(res, 'chdirTo', '/foo/bar/Ba_z9');
      assert.propertyVal(res, 'createDir', false);
      done();
    });
    it('changes directory if the name is fixable', (done) => {
      const res = checkProjectName('Ba-z', cwd, dirList);
      assert.propertyVal(res, 'dirName', 'Ba-z');
      assert.propertyVal(res, 'projectName', 'Ba_z');
      assert.propertyVal(res, 'chdirTo', '/foo/bar/Ba-z');
      assert.propertyVal(res, 'createDir', false);
      done();
    });
  });
});
