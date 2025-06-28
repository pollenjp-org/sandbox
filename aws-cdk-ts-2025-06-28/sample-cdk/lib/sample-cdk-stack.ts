import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import * as route53 from "aws-cdk-lib/aws-route53";
import { Region, AvailabilityZone } from './constant';

type SampleCdkStackCustomProps = {
  hostedZone: route53.HostedZone;
  region: Region;
  availabilityZone: AvailabilityZone;
}

interface SampleCdkStackProps extends StackProps {
  customProps: SampleCdkStackCustomProps;
}

interface SampleCdkStackCustomOutputProps {
  elasticIp: ec2.CfnEIP;
}

export class SampleCdkStack extends Stack {
  public CustomOutProps: SampleCdkStackCustomOutputProps;
  constructor(scope: Construct, id: string, props: SampleCdkStackProps) {
    super(scope, id, props);
    const { customProps: { hostedZone, region, availabilityZone } } = props;

    const vpc = new ec2.Vpc(this, "SampleVpc", {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      availabilityZones: [availabilityZone],
    });

    const keyPair = new ec2.KeyPair(this, 'KeyPair', {
      // ~/.ssh/id_ed25519.pub
      publicKeyMaterial: readFileSync(
        path.join(homedir(), '.ssh', 'id_ed25519.pub'),
        'utf-8'
      ),
    });

    const server1 = new ec2.Instance(this, 'Server1Instance', {
      vpc,
      // https://aws.amazon.com/ec2/pricing/on-demand/
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.genericLinux({
        // Ubuntu Server 24.04 LTS (HVM), SSD Volume Type
        // ami-0b2cd2a95639e0e5b (64 ビット (x86)) / ami-0572f66e3d11e0734 (64 ビット (Arm))
        // Ubuntu Server 24.04 LTS (HVM),EBS General Purpose (SSD) Volume Type. Support available from Canonical (http://www.ubuntu.com/cloud/services).
        [region]: 'ami-0b2cd2a95639e0e5b',
      }),
      availabilityZone,
      // EC2 インスタンスを配置するサブネットを指定
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      keyPair,
      blockDevices: [
        // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.BlockDevice.html
        {
          // Differs by AMI
          // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/device_naming.html
          // Check by Web console
          // ami-0b2cd2a95639e0e5b : /dev/sda1
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
            throughput: 125,
          }),
        },
        {
          // Recommended for EBS volumes
          // /dev/sd[f-p] *
          deviceName: '/dev/sdf',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
            throughput: 125,
          }),
        },
      ],
    });

    const mySecurityGroup = new ec2.SecurityGroup(this, 'MySecurityGroup', {
      vpc,
      description: 'Allow ssh access to ec2 instances',
      allowAllOutbound: true
    });
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow ssh access from the world');
    server1.addSecurityGroup(mySecurityGroup);

    const elasticIp = new ec2.CfnEIP(this, 'MyEIP', {
      domain: 'vpc',
      instanceId: server1.instanceId,
    });

    new route53.ARecord(this, 'MyServer1ARecord', {
      zone: hostedZone,
      target: route53.RecordTarget.fromIpAddresses(elasticIp.ref),
      recordName: 'server1',
    });

    this.CustomOutProps = {
      elasticIp,
    };
  }
}
