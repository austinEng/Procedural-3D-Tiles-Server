'use strict';

const Cesium = require('cesium');
const gltfPipeline = require('gltf-pipeline');
const glbToB3dm = require('3d-tiles-tools/lib/glbToB3dm');
const addPipelineExtras = gltfPipeline.addPipelineExtras;
const getBinaryGltf = gltfPipeline.getBinaryGltf;
const loadGltfUris = gltfPipeline.loadGltfUris;
const processJSON = gltfPipeline.Pipeline.processJSON;
const addCesiumRTC = gltfPipeline.addCesiumRTC;

//TERRAIN GENERATION STUFF
const THREE = require('three');


//SETTING UP THE POS AND NORMAL VECTORS FROM RADIANS TO CARTESIAN COORDINATES
function TerrainProvider(treeProvider) {
    this.treeProvider = treeProvider;
}


var scratchCartographic = new Cesium.Cartographic();
var scratchCartesian = new Cesium.Cartesian3();

function setPosition(originlon, originlat, lon, lat, height, result) {
    Cesium.Cartographic.fromRadians(lon, lat, height, scratchCartographic);
    Cesium.Ellipsoid.WGS84.cartographicToCartesian(scratchCartographic, scratchCartesian);
    result[0] = scratchCartesian.x;
    result[1] = scratchCartesian.y;
    result[2] = scratchCartesian.z;


    // position is relative to southwest corner
    //  Cesium.Cartographic.fromRadians(originlon, originlat, 0, scratchCartographic);
    //  Cesium.Ellipsoid.WGS84.cartographicToCartesian(scratchCartographic, scratchCartesian);
    //  result[0] -= scratchCartesian.x;
    //  result[1] -= scratchCartesian.y;
    //  result[2] -= scratchCartesian.z;


}

function setNormal(lon, lat, height, result) {
    Cesium.Cartographic.fromRadians(lon, lat, height, scratchCartographic);
    Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(scratchCartographic, scratchCartesian);
    result[0] = scratchCartesian.x;
    result[1] = scratchCartesian.y;
    result[2] = scratchCartesian.z;
}

//set normal from cartesian
var normal = [];
function setcartesiannormal(posx, posy, posz) {
    normal = [];
    
    //convert cartesian positions to cartographics on a WGS84 ellpisoid
    var position = new Cesium.Cartesian3(posx, posy, posz);
    var cartographicPosition = Cesium.Ellipsoid.WGS84.cartesianToCartographic(position);
    
    //convert cartographics rep. to normal rep. on the ellipsoid
    var normalCartesian = new Cesium.Cartesian3();
    Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(cartographicPosition, normalCartesian);

    normal[0] = normalCartesian.x;
    normal[1] = normalCartesian.y;
    normal[2] = normalCartesian.z;
    
}

//setting up the subdivision row positions
var pos_arr = [];
function getRowSubdivPos(depth, pointl, pointr, indexl, indexr) 
{
    if(depth > 2)
    {
        return;
    }

    pos_arr[(indexl + indexr) / 2] = new THREE.Vector3((pointr.x + pointl.x) / 2, (pointr.y + pointl.y) / 2, (pointr.z + pointl.z) / 2);
    
    depth += 1;
    getRowSubdivPos(depth, pointl, pos_arr[(indexl + indexr) / 2], indexl, (indexl + indexr) / 2);
    getRowSubdivPos(depth, pos_arr[(indexl + indexr) / 2], pointr, (indexl + indexr) / 2, indexr);

}

TerrainProvider.prototype.generateTerrain = function (hemisphere, index) {
    // west, south, east, north
    var region = this.treeProvider.generateBoundingRegion(hemisphere, index);

    
    var northPole = (region[3] === Math.PI / 2); //false
    var southPole = (region[1] === -Math.PI / 2); //false
    var pole = northPole || southPole;

//    var vertexCount = pole ? 3 : 9;//81;//9;//4;
//    var indexCount = 3 * (vertexCount - 2);

//    var indices
//    if(pole)
//        
//    else
//        indices = new Uint16Array(24);//384);
    var vertexCount, indexCount;
    
    if (pole) {
        vertexCount = 3;
        indexCount = 3;
    } else {
        vertexCount = 81;//9
        indexCount = 384;//24;
    }
    
    var indices = new Uint16Array(indexCount);
    
    var normals = new Float32Array(3 * vertexCount);
    var positions = new Float32Array(3 * vertexCount);

    var componentBytes = 3 * Float32Array.BYTES_PER_ELEMENT;
    var corner;


    if (!pole) 
    {
        // west, south, east, north
        var SUBS = 3;

        var stepLong = (region[2] - region[0]) * Math.pow(0.5, SUBS); //left to right
        var stepLat = (region[3] - region[1]) * Math.pow(0.5, SUBS); //bottom to top
        
        var CartographicPos = new Cesium.Cartographic();
        var CartesianPos = new Cesium.Cartesian3();
        
        var p = 0;
        for (var i = 0; i <= Math.pow(2,SUBS); ++i) 
        {
            for (var j = 0; j <= Math.pow(2,SUBS); ++j) 
            {
                var lat = region[1] + i * stepLat;
                var long = region[0] + j * stepLong;
                
                //set the position
                Cesium.Cartographic.fromRadians(long, lat, 0, CartographicPos);
                Cesium.Ellipsoid.WGS84.cartographicToCartesian(CartographicPos, CartesianPos);
                
                positions[3*p+0] = CartesianPos.x;
                positions[3*p+1] = CartesianPos.y;
                positions[3*p+2] = CartesianPos.z;
            
                //set the normal
                Cesium.Cartographic.fromRadians(long, lat, 0, CartographicPos);
                Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(CartographicPos, CartesianPos);
                
                normals[3*p+0] = CartesianPos.x;
                normals[3*p+1] = CartesianPos.y;
                normals[3*p+2] = CartesianPos.z;
                
                p+=1;
            }
        }
    }
    else
    {
        //  0      1     2     3  
        // west, south, east, north
        //set position of the triangle based in the south pole or the north pole
        var CartographicPos = new Cesium.Cartographic();
        var CartesianPos = new Cesium.Cartesian3();
        var p = 0;
        
        //south west
        //set position
        Cesium.Cartographic.fromRadians(region[0], region[1], 0, CartographicPos);
        Cesium.Ellipsoid.WGS84.cartographicToCartesian(CartographicPos, CartesianPos);
        
        positions[3*p+0] = CartesianPos.x;
        positions[3*p+1] = CartesianPos.y;
        positions[3*p+2] = CartesianPos.z;
        
        
        //set the normal
        Cesium.Cartographic.fromRadians(region[0], region[1], 0, CartographicPos);
        Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(CartographicPos, CartesianPos);

        normals[3*p+0] = CartesianPos.x;
        normals[3*p+1] = CartesianPos.y;
        normals[3*p+2] = CartesianPos.z;
        p++;
        
        if(!southPole)
        {
            //south east
            //set position
            Cesium.Cartographic.fromRadians(region[2], region[1], 0, CartographicPos);
            Cesium.Ellipsoid.WGS84.cartographicToCartesian(CartographicPos, CartesianPos);
        
            positions[3*p+0] = CartesianPos.x;
            positions[3*p+1] = CartesianPos.y;
            positions[3*p+2] = CartesianPos.z;
            
            
            //set the normal
            Cesium.Cartographic.fromRadians(region[2], region[1], 0, CartographicPos);
            Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(CartographicPos, CartesianPos);

            normals[3 * p + 0] = CartesianPos.x;
            normals[3 * p + 1] = CartesianPos.y;
            normals[3 * p + 2] = CartesianPos.z;
            p++;
        }
        
        //north east
        //set position
        Cesium.Cartographic.fromRadians(region[2], region[3], 0, CartographicPos);
        Cesium.Ellipsoid.WGS84.cartographicToCartesian(CartographicPos, CartesianPos);

        positions[3*p+0] = CartesianPos.x;
        positions[3*p+1] = CartesianPos.y;
        positions[3*p+2] = CartesianPos.z;


        //set the normal
        Cesium.Cartographic.fromRadians(region[2], region[3], 0, CartographicPos);
        Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(CartographicPos, CartesianPos);

        normals[3 * p + 0] = CartesianPos.x;
        normals[3 * p + 1] = CartesianPos.y;
        normals[3 * p + 2] = CartesianPos.z;
        p++;
        
        
        if(!northPole)
        {
            //north west
            //set position
            Cesium.Cartographic.fromRadians(region[0], region[3], 0, CartographicPos);
            Cesium.Ellipsoid.WGS84.cartographicToCartesian(CartographicPos, CartesianPos);
        
            positions[3*p+0] = CartesianPos.x;
            positions[3*p+1] = CartesianPos.y;
            positions[3*p+2] = CartesianPos.z;
            
            
            //set the normal
            Cesium.Cartographic.fromRadians(region[0], region[3], 0, CartographicPos);
            Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(CartographicPos, CartesianPos);

            normals[3 * p + 0] = CartesianPos.x;
            normals[3 * p + 1] = CartesianPos.y;
            normals[3 * p + 2] = CartesianPos.z;
            p++;
        }
        
    }

    
    
//        corner = 0;
//        var sw = new Float32Array(positions.buffer, componentBytes * (corner++), 3);
//        if (!southPole) var se = new Float32Array(positions.buffer, componentBytes * (corner++), 3);
//        var ne = new Float32Array(positions.buffer, componentBytes * (corner++), 3);
//        if (!northPole) var nw = new Float32Array(positions.buffer, componentBytes * (corner++), 3);
//
//        setPosition(region[0], region[1], region[0], region[1], 0, sw); // south west
//        if (!southPole) setPosition(region[0], region[1], region[2], region[1], 0, se); // south east
//        setPosition(region[0], region[1], region[2], region[3], 0, ne); // north east
//        if (!northPole) setPosition(region[0], region[1], region[0], region[3], 0, nw); // north west
//
//        corner = 0;
//        setNormal(region[0], region[1], 0, new Float32Array(normals.buffer, componentBytes * (corner++), 3));
//        if (!southPole) setNormal(region[2], region[1], 0, new Float32Array(normals.buffer, componentBytes * (corner++), 3));
//        setNormal(region[2], region[3], 0, new Float32Array(normals.buffer, componentBytes * (corner++), 3));
//        if (!northPole) setNormal(region[0], region[3], 0, new Float32Array(normals.buffer, componentBytes * (corner++), 3));
//
//    //FURTHURE SUBDIVISION OF THE TILE
//    //position array -> 3 * [sw, (!southpole)se, ne, (!northpole)nw]
//    // west, south, east, north, bottom, top <- region
//
//    if (!pole) {
//        
//        //sw -> se row 0
//        pos_arr = [];
//       
//        var row_0 = [];
//        pos_arr[0] = new THREE.Vector3(positions[0],positions[1],positions[2]);
//        pos_arr[8] = new THREE.Vector3(positions[3],positions[4],positions[5]);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//
//        var count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_0[3 * i + 0] = pos_arr[count].x;
//            row_0[3 * i + 1] = pos_arr[count].y;
//            row_0[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        row_0[0] = pos_arr[0].x;
////        row_0[1] = pos_arr[0].y;
////        row_0[2] = pos_arr[0].z;
////        row_0[3] = pos_arr[4].x;
////        row_0[4] = pos_arr[4].y;
////        row_0[5] = pos_arr[4].z;
////        row_0[6] = pos_arr[8].x;
////        row_0[7] = pos_arr[8].y;
////        row_0[8] = pos_arr[8].z;
//        
//        
////        console.log("row_0");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_0 vertice pos");
////            console.log(row_0[3 * pr + 0]);
////            console.log(row_0[3 * pr + 1]);
////            console.log(row_0[3 * pr + 2]);
////            
////            console.log("row_0 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//
//        //nw -> ne row 8
//        pos_arr = [];
//        
//        var row_8 = [];
//        pos_arr[0] = new THREE.Vector3(positions[9],positions[10],positions[11]);
//        pos_arr[8] = new THREE.Vector3(positions[6],positions[7],positions[8]);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_8[3 * i + 0] = pos_arr[count].x;
//            row_8[3 * i + 1] = pos_arr[count].y;
//            row_8[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        row_8[0] = pos_arr[0].x;
////        row_8[1] = pos_arr[0].y;
////        row_8[2] = pos_arr[0].z;
////        row_8[3] = pos_arr[4].x;
////        row_8[4] = pos_arr[4].y;
////        row_8[5] = pos_arr[4].z;
////        row_8[6] = pos_arr[8].x;
////        row_8[7] = pos_arr[8].y;
////        row_8[8] = pos_arr[8].z;
//        
//        
////        console.log("row_8");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_8 vertice pos");
////            console.log(row_8[3 * pr + 0]);
////            console.log(row_8[3 * pr + 1]);
////            console.log(row_8[3 * pr + 2]);
////            
////            console.log("row_8 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //w -> e row 4
//        pos_arr = [];
//        
//        var row_4 = [];
//        pos_arr[0] = new THREE.Vector3((positions[0] + positions[9]) / 2, 
//                                       (positions[1] + positions[10]) / 2, 
//                                       (positions[2] + positions[11]) / 2);
//        pos_arr[8] = new THREE.Vector3((positions[3] + positions[6]) / 2, 
//                                       (positions[4] + positions[7]) / 2, 
//                                       (positions[5] + positions[8]) / 2);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//        
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_4[3 * i + 0] = pos_arr[count].x;
//            row_4[3 * i + 1] = pos_arr[count].y;
//            row_4[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        row_4[0] = pos_arr[0].x;
////        row_4[1] = pos_arr[0].y;
////        row_4[2] = pos_arr[0].z;
////        row_4[3] = pos_arr[4].x;
////        row_4[4] = pos_arr[4].y;
////        row_4[5] = pos_arr[4].z;
////        row_4[6] = pos_arr[8].x;
////        row_4[7] = pos_arr[8].y;
////        row_4[8] = pos_arr[8].z;
//        
////        console.log("row_4");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_4 vertice pos");
////            console.log(row_4[3 * pr + 0]);
////            console.log(row_4[3 * pr + 1]);
////            console.log(row_4[3 * pr + 2]);
////            
////            console.log("row_4 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //sw -> se row 2
//        pos_arr = [];
//        
//        var row_2 = [];
//        pos_arr[0] = new THREE.Vector3((row_4[0] + positions[0]) / 2, (row_4[1] + positions[1]) / 2, (row_4[2] + positions[2]) / 2);
//        pos_arr[8] = new THREE.Vector3((row_4[24] + positions[3]) / 2, (row_4[25] + positions[4]) / 2, (row_4[26] + positions[5]) / 2);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//        
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_2[3 * i + 0] = pos_arr[count].x;
//            row_2[3 * i + 1] = pos_arr[count].y;
//            row_2[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        console.log("row_2");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_2 vertice pos");
////            console.log(row_2[3 * pr + 0]);
////            console.log(row_2[3 * pr + 1]);
////            console.log(row_2[3 * pr + 2]);
////            
////            console.log("row_2 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //sw -> se row 1
//        pos_arr = [];
//        
//        var row_1 = [];
//        pos_arr[0] = new THREE.Vector3((row_2[0] + positions[0]) / 2, (row_2[1] + positions[1]) / 2, (row_2[2] + positions[2]) / 2);
//        pos_arr[8] = new THREE.Vector3((row_2[24] + positions[3]) / 2, (row_2[25] + positions[4]) / 2, (row_2[26] + positions[5]) / 2);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//        
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_1[3 * i + 0] = pos_arr[count].x;
//            row_1[3 * i + 1] = pos_arr[count].y;
//            row_1[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        console.log("row_1");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_1 vertice pos");
////            console.log(row_1[3 * pr + 0]);
////            console.log(row_1[3 * pr + 1]);
////            console.log(row_1[3 * pr + 2]);
////            
////            console.log("row_1 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //sw -> se row 3
//        pos_arr = [];
//        
//        var row_3 = [];
//        pos_arr[0] = new THREE.Vector3((row_2[0] + row_4[0]) / 2, (row_2[1] + row_4[1]) / 2, (row_2[2] + row_4[2]) / 2);
//        pos_arr[8] = new THREE.Vector3((row_2[24] + row_4[24]) / 2, (row_2[25] + row_4[25]) / 2, (row_2[26] + row_4[26]) / 2);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//        
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_3[3 * i + 0] = pos_arr[count].x;
//            row_3[3 * i + 1] = pos_arr[count].y;
//            row_3[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        console.log("row_3");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_3 vertice pos");
////            console.log(row_3[3 * pr + 0]);
////            console.log(row_3[3 * pr + 1]);
////            console.log(row_3[3 * pr + 2]);
////            
////            console.log("row_3 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //nw -> ne row 6
//        pos_arr = [];
//       
//        var row_6 = [];
//        pos_arr[0] = new THREE.Vector3((positions[9] + row_4[0]) / 2, (positions[10] + row_4[1]) / 2, (positions[11] + row_4[2]) / 2);
//        pos_arr[8] = new THREE.Vector3((positions[6] + row_4[24]) / 2, (positions[7] + row_4[25]) / 2, (positions[8] + row_4[26]) / 2);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//        
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_6[3 * i + 0] = pos_arr[count].x;
//            row_6[3 * i + 1] = pos_arr[count].y;
//            row_6[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        console.log("row_6");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_6 vertice pos");
////            console.log(row_6[3 * pr + 0]);
////            console.log(row_6[3 * pr + 1]);
////            console.log(row_6[3 * pr + 2]);
////            
////            console.log("row_6 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //nw -> ne row 5
//        pos_arr = [];
//        
//        var row_5 = [];
//        pos_arr[0] = new THREE.Vector3((row_6[0] + row_4[0]) / 2, (row_6[1] + row_4[1]) / 2, (row_6[2] + row_4[2]) / 2);
//        pos_arr[8] = new THREE.Vector3((row_6[24] + row_4[24]) / 2, (row_6[25] + row_4[25]) / 2, (row_6[26] + row_4[26]) / 2);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//        
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_5[3 * i + 0] = pos_arr[count].x;
//            row_5[3 * i + 1] = pos_arr[count].y;
//            row_5[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//        
////        console.log("row_5");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_5 vertice pos");
////            console.log(row_5[3 * pr + 0]);
////            console.log(row_5[3 * pr + 1]);
////            console.log(row_5[3 * pr + 2]);
////            
////            console.log("row_5 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //nw -> ne row 7
//        pos_arr = [];
//        
//        var row_7 = [];
//        pos_arr[0] = new THREE.Vector3((row_6[0] + positions[9]) / 2, (row_6[1] + positions[10]) / 2, (row_6[2] + positions[11]) / 2);
//        pos_arr[8] = new THREE.Vector3((row_6[24] + positions[6]) / 2, (row_6[25] + positions[7]) / 2, (row_6[26] + positions[8]) / 2);
//        
//        getRowSubdivPos(0, pos_arr[0], pos_arr[8], 0, 8);
//        
//        count = 0;
//        for(var i = 0; i < 9 ; i++)
//        {
//            row_7[3 * i + 0] = pos_arr[count].x;
//            row_7[3 * i + 1] = pos_arr[count].y;
//            row_7[3 * i + 2] = pos_arr[count].z;
//            count++;
//        }
//
////        console.log("row_7");
////        for(var pr = 0 ; pr < 9; pr++)
////        {
////            console.log("row_7 vertice pos");
////            console.log(row_7[3 * pr + 0]);
////            console.log(row_7[3 * pr + 1]);
////            console.log(row_7[3 * pr + 2]);
////        
////            console.log("row_7 pos_arr vertice pos");
////            console.log(pos_arr[pr].x);
////            console.log(pos_arr[pr].y);
////            console.log(pos_arr[pr].z);
////            
////        }
//        
//        //filling the positions in their respective arrays
////        count = 0;
////        for(var i = 0;i < 9; i++)
////            {
////                positions[count] = row_0[i];
////                count++;
////            }
////        
////        for(var i = 0;i < 9; i++)
////            {
////                positions[count] = row_4[i];
////                count++;
////            }
////        
////        for(var i = 0;i < 9; i++)
////            {
////                positions[count] = row_8[i];
////                count++;
////            }
//        
//
//        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_0[i];
//            count++;
//        }
////        console.log("size of positions after row_0 " + positions.length);
////        console.log("row_0 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_1[i];
//            count++;
//        }
////        console.log("size of positions after row_1 " + positions.length);
////        console.log("row_1 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_2[i];
//            count++;
//        }
////        console.log("size of positions after row_2 " + positions.length);
////        console.log("row_2 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_3[i];
//            count++;
//        }
////        console.log("size of positions after row_3 " + positions.length);
////        console.log("row_3 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_4[i];
//            count++;
//        }
////        console.log("size of positions after row_4 " + positions.length);
////        console.log("row_4 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_5[i];
//            count++;
//        }
////        console.log("size of positions after row_5 " + positions.length);
////        console.log("row_5 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_6[i];
//            count++;
//        }
////        console.log("size of positions after row_6 " + positions.length);
////        console.log("row_6 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_7[i];
//            count++;
//        }
////        console.log("size of positions after row_7 " + positions.length);
////        console.log("row_7 count value " + count);
//        
////        count = 0;
//        for(var i = 0; i < 27; i++)
//        {
//            positions[count] = row_8[i];
//            count++;
//        }
////        console.log("size of positions after row_8 " + positions.length);
////        console.log("row_8 count value " + count);
//        
//        //filling the normals in their respective arrays
//        for(var i = 0 ; i < 81 ; i++)//81
//        {
//            /*var nor = */setcartesiannormal(positions[3 * i + 0], positions[3 * i + 1], positions[3 * i + 2]);
//            normals[3 * i + 0] = normal[0];
//            normals[3 * i + 1] = normal[1];
//            normals[3 * i + 2] = normal[2];
//
//        } 
//        
//    }

    console.log("size of normals: " + normals.length);
    console.log("size of positions: " + positions.length);
    console.log("no of indices: " + indexCount);
    console.log("nor of vertex: " + vertexCount);
    
//    for(var i = 0 ; i < positions.length; ++i)
//        console.log("position: " + i + " "+ positions[i]);

    //SETTING THE MIN AND MAX BOUNDS
    var minPosition = [positions[0], positions[1], positions[2]];
    var maxPosition = [positions[0], positions[1], positions[2]];

    let padding = 0;
    for (let i = 0; i < vertexCount; ++i) {
        minPosition[0] = Math.min(minPosition[0], positions[3 * i + 0] - padding);
        minPosition[1] = Math.min(minPosition[1], positions[3 * i + 1] - padding);
        minPosition[2] = Math.min(minPosition[2], positions[3 * i + 2] - padding);
        maxPosition[0] = Math.max(maxPosition[0], positions[3 * i + 0] + padding);
        maxPosition[1] = Math.max(maxPosition[1], positions[3 * i + 1] + padding);
        maxPosition[2] = Math.max(maxPosition[2], positions[3 * i + 2] + padding);
    }

    
//    indices.set(pole ? [0, 1, 2] : ind);
    //[0, 4, 6, 0, 6, 5, 4, 1, 7, 4, 7, 6, 6, 7, 2, 6, 2, 8, 5, 6, 8, 5, 8, 3]); //[0, 1, 2, 0, 2, 3]);
    
    if(pole)
        indices.set([0,1,2]);
    else
    {
        var ind = [];
        //setup indices for the subdivided tile mesh
        var j = 0;
        for (var i = 0; i < 72; i++) {
            if ((i + 1) % 9 == 0)
                continue;

            ind[6 * j + 0] = i;
            ind[6 * j + 1] = i + 1;
            ind[6 * j + 2] = i + 10;
            ind[6 * j + 3] = i;
            ind[6 * j + 4] = i + 10;
            ind[6 * j + 5] = i + 9;

            j++;
        }
        
        for(var i = 0 ; i < ind.length; i++)
        {
            indices[i] = ind[i];
        }
   
        console.log("indices length: " + indices.length);
//        indices.set([0,1,4,0,4,3,1,2,5,1,5,4,4,5,8,4,8,7,3,4,7,3,7,6]);

//        indices.set([0,1,4,0,4,3,1,2,5,1,5,4,4,5,8,4,8,7,3,7,6,3,4,7]);
//        indices.set([3,4,7,3,7,6,4,5,8,4,8,7,0,1,4,0,4,3,1,2,5,1,5,4]);
//        indices.set([0,1,4,0,4,3,1,2,5,1,5,4,3,4,7,3,7,6,4,5,8,4,8,7]);
//        indices.set([0,1,4,0,4,3,1,2,8,1,8,7,3,4,7,3,7,6]);
//        indices.set([0,4,3]);
//        indices.set([0,1,4,0,4,3]);
//        indices.set([3,4,7]);
    }

    //END PROCEDURAL TERRAIN STUFF

    var buffer = Buffer.concat([
    Buffer.from(indices.buffer),
    Buffer.from(normals.buffer),
    Buffer.from(positions.buffer)
  ], indices.byteLength + normals.byteLength + positions.byteLength);

    // https://github.com/KhronosGroup/glTF/tree/master/specification/1.0/schema
    var gltf = {
        accessors: {
            accessor_ind: {
                bufferView: "bufferView_ind",
                byteOffset: 0,
                byteStride: 0,
                componentType: 5123, // UNSIGNED_SHORT
                count: indexCount,
                type: "SCALAR"
            },
            accessor_nor: {
                bufferView: "bufferViews_attr",
                byteOffset: 0,
                byteStride: 0,
                componentType: 5126, // FLOAT
                count: vertexCount,
                max: [1, 1, 1],
                min: [-1, -1, -1],
                type: "VEC3"
            },
            accessor_pos: {
                bufferView: "bufferViews_attr",
                byteOffset: componentBytes * vertexCount,
                byteStride: 0,
                componentType: 5126, // FLOAT
                count: vertexCount,
                max: maxPosition,
                min: minPosition,
                type: "VEC3"
            }
        },
        asset: {
            premultipliedAlpha: true,
            profile: {
                api: "WebGL",
                version: "1.0.2"
            },
            version: "1.0"
        },
        bufferViews: {
            bufferView_ind: {
                buffer: "Terrain",
                byteLength: indices.byteLength,
                byteOffset: 0,
                target: 34963 // ELEMENT_ARRAY_BUFFER 
            },
            bufferViews_attr: {
                buffer: "Terrain",
                byteLength: normals.byteLength + positions.byteLength,
                byteOffset: indices.byteLength,
                target: 34962 // ARRAY_BUFFER
            }
        },
        buffers: {
            Terrain: {
                byteLength: buffer.byteLength,
                type: "arraybuffer",
                uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`
            }
        },
        materials: {
            material_terrain: {
                name: "MaterialTerrain",
                technique: "technique_terrain",
                values: {
                    diffuse: [0.8, 0.8, 0.8, 1]
                }
            }
        },
        meshes: {
            mesh_terrain: {
                name: "Terrain",
                primitives: [
                    {
                        attributes: {
                            NORMAL: "accessor_nor",
                            POSITION: "accessor_pos",
                        },
                        indices: "accessor_ind",
                        material: "material_terrain",
                        mode: 4 // triangles
          }
        ]
            }
        },
        nodes: {
            node_terrain: {
                children: [],
                matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                meshes: ["mesh_terrain"],
                name: "Terrain"
            }
        },
        programs: {
            program_terrain: {
                attributes: [
          "a_normal",
          "a_position"
        ],
                fragmentShader: 'terrainFS',
                vertexShader: 'terrainVS'
            }
        },
        scene: "defaultScene",
        scenes: {
            defaultScene: {
                nodes: [
          "node_terrain"
        ]
            }
        },
        shaders: {
            terrainFS: {
                type: 35632,
                uri: "shaders/terrainFS.glsl"
            },
            terrainVS: {
                type: 35633,
                uri: "shaders/terrainVS.glsl"
            }
        },
        techniques: {
            technique_terrain: {
                attributes: {
                    a_normal: "normal",
                    a_position: "position"
                },
                parameters: {
                    "diffuse": {
                        "type": 35666
                    },
                    "modelViewMatrix": {
                        "semantic": "MODELVIEW",
                        "type": 35676
                    },
                    "normal": {
                        "semantic": "NORMAL",
                        "type": 35665
                    },
                    "normalMatrix": {
                        "semantic": "MODELVIEWINVERSETRANSPOSE",
                        "type": 35675
                    },
                    "position": {
                        "semantic": "POSITION",
                        "type": 35665
                    },
                    "projectionMatrix": {
                        "semantic": "PROJECTION",
                        "type": 35676
                    },
                },
                program: "program_terrain",
                states: {
                    enable: [
            2929, // DEPTH_TEST
            2884 // CULL_FACE
          ]
                },
                uniforms: {
                    u_diffuse: "diffuse",
                    u_modelViewMatrix: "modelViewMatrix",
                    u_normalMatrix: "normalMatrix",
                    u_projectionMatrix: "projectionMatrix",
                }
            }
        }
    };

    //  addCesiumRTC(gltf, {
    //    longitude: region[0],
    //    latitude: region[1],
    //    height: 0
    //  });

    const pipelineOptions = {
        basePath: __dirname,
        optimizeForCesium: true
    };

    return processJSON(gltf, pipelineOptions)
        .then(function (optimizedGltf) {
            var gltfWithExtras = addPipelineExtras(optimizedGltf);
            return loadGltfUris(gltfWithExtras);
        })
        .then(function (pipelineGltf) {
            var binaryGltf = getBinaryGltf(pipelineGltf, true, false);
            var glbBuffer = binaryGltf.glb;
            var b3dmBuffer = glbToB3dm(glbBuffer);
            return b3dmBuffer;
        });
}

module.exports = TerrainProvider;
