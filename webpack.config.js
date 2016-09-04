/**
 * Copyright (c) 2014-2016, Coffeine Inc
 *
 * @author <a href = "mailto:vitaliyacm@gmail.com">Vitaliy Tsutsman</a>
 *
 * @date 9:07 PM
 */

var path = require('path');
var webpack = require('webpack');

module.exports = {

    entry: [
        "./src/main"
    ],

    output: {
        path: path.resolve( __dirname ),
        filename: "main.js"
    },

    resolve: {
        root: [
            path.resolve( "./src" ),
            path.resolve( "./dist" )
        ],
        modulesDirectories: [
            "libs",
            "node_modules"
        ]
    },

    module: {
        loaders: [
            {
                loader: "babel-loader",

                //- Set src dir -//
                include: [
                    path.resolve( __dirname, "src/" )
                ],

                exclude: [
                    path.resolve( __dirname, "node_modules/" ),
                    path.resolve( __dirname, "library/" )
                ],

                //- Pattern for files for transpile -//
                test: /\.js$/,

                //- Options -//
                query: {
                    plugins: [
                        "transform-runtime"
                    ],
                    presets: [
                        "es2015",
                        "stage-0"
                    ]
                }
            }
        ]
    },

    plugins: [
        // Avoid publishing files when compilation fails
        new webpack.NoErrorsPlugin(),
        new webpack.ResolverPlugin(
            new webpack.ResolverPlugin.DirectoryDescriptionFilePlugin("bower.json", ["main"])
        )
    ],

    stats: {
        colors: true
    },

    devtool: 'source-map'
};
