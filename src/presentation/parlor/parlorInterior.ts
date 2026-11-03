import type {Scene} from '@babylonjs/core/scene';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type {TownBounds} from '../town/townAssets';
import {PARLOR_ORIGIN,PARLOR_HOST} from '../../domain/town/mahjongParlor';
import {createParlorRoom} from './parlorRoom';
import {createIchimokuGen} from './ichimokuGen';

export interface ParlorInterior {
 readonly casters:AbstractMesh[];readonly receivers:Mesh[];readonly cameraSolids:TownBounds[];
 /** Animates 一目元; pass the player's head position so its eye can follow. */
 update(seconds:number,lookAt:Vector3):void;
}

/** 白石台麻館 and its host, built inside the region world at PARLOR_ORIGIN. */
export async function createParlorInterior(scene:Scene):Promise<ParlorInterior>{
 const origin=new Vector3(PARLOR_ORIGIN.x,PARLOR_ORIGIN.y,PARLOR_ORIGIN.z);
 const room=await createParlorRoom(scene,origin);
 const at=new Vector3(PARLOR_HOST.x,0,PARLOR_HOST.z).addInPlace(origin);
 const host=await createIchimokuGen(scene,at.add(new Vector3(0,PARLOR_HOST.hover,0)),PARLOR_HOST.yaw);
 const collider=CreateCylinder('ichimoku-collider',{height:2.4,diameter:.9},scene);
 collider.position.copyFrom(at.add(new Vector3(0,1.2,0)));collider.isVisible=false;collider.isPickable=false;
 new PhysicsAggregate(collider,PhysicsShapeType.CYLINDER,{mass:0,friction:.8},scene);
 return {casters:[...room.casters,...host.meshes],receivers:room.receivers,cameraSolids:room.cameraSolids,update:(seconds,lookAt)=>host.update(seconds,lookAt)};
}
