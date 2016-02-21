const gulp = require('gulp');
const babel = require("gulp-babel")
const rename = require("gulp-rename")
const browserify = require("browserify")

gulp.task('compile-tests', function() {
    gulp.src("./test/*.js")
    .pipe(babel({
			presets: ['es2015']
		}))
    .pipe(rename(function (path) {
      path.extname = ".es5"
    }))
    .pipe(gulp.dest("test"))
})
